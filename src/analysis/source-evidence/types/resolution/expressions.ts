import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";

import { nextState } from "./state.js";
import { selectCsharpTargetElement, selectCsharpTargetProperty } from "../../../operations/members/selected-members.js";
import { selectCsharpMethodValue } from "../../../objects/method-values.js";
import { getCsharpMethodValue } from "../../../../target-model/types/method-values.js";
import { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { resolveCsharpStaticMemberReceiver } from "../../../../policy/types/project/static-members.js";

export function resolveMemberAccessTargetType(
  { host, optionalAccessTargetType, policy, resolveSelectedDeclarationResult, resolveSelectedReceiverTargetType }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const selectionHost = { ...host, projectTypes: host.projectTypes(), types: policy };
  const selection = host.ast.is.IsElementAccessExpression(node)
    ? selectCsharpTargetElement(selectionHost, node, queries.sourceFile)
    : selectCsharpTargetProperty(selectionHost, node, queries.sourceFile);
  if (selection.kind === "project-indexer") return optionalAccessTargetType(
    selection.valueType, selection.source.optionalChain);
  if (selection.kind === "union-property") return selection.resultCarrier;
  if (selection.kind === "resolved" || selection.kind === "source-owned") {
    const receiverType = resolveSelectedReceiverTargetType(selection.source.receiver, queries, state);
    const methodValue = selectCsharpMethodValue(receiverType, queries.facts.selectedSubjects(
      selection.source.selectedSymbol, selection.source.selectedDeclaration), host,
      selection.source.accessMode !== "read" ? "storage" : selection.source.callCallee ? "call" : "value");
    if (methodValue !== undefined) return optionalAccessTargetType(methodValue, selection.source.optionalChain);
  }
  if (selection.kind === "resolved") {
    return optionalAccessTargetType(
      selection.targetMember.returnType,
      selection.source.optionalChain,
    );
  }
  if (selection.kind !== "source-owned") {
    return undefined;
  }
  const receiverType = resolveCsharpStaticMemberReceiver(host.ast, host.navigation, host.projectTypeCatalog,
    selection.source.selectedDeclaration, selection.source.receiver.expression) ?? resolveSelectedReceiverTargetType(
    selection.source.receiver,
    queries,
    state,
  );
  if (host.ast.is.IsElementAccessExpression(node)) {
    const index = "selectedElementIndex" in selection.source ? selection.source.selectedElementIndex : undefined;
    if (receiverType?.kind === "tuple" && index !== undefined)
      return optionalAccessTargetType(receiverType.elements[index], selection.source.optionalChain);
    if (receiverType?.kind === "array") return optionalAccessTargetType(receiverType.element, selection.source.optionalChain);
  }
  if (selection.source.selectedDeclaration !== undefined && host.ast.is.IsBindingElement(selection.source.selectedDeclaration)) {
    const projected = host.bindingProjection(selection.source.selectedDeclaration, queries.sourceFile)?.bindingCarrier;
    return optionalAccessTargetType(projected, selection.source.optionalChain);
  }
  const invocationType = (type: TargetTypeRef | undefined): TargetTypeRef | undefined => {
    const declaration = selection.source.selectedDeclaration;
    return selection.source.callCallee && declaration !== undefined &&
      (host.ast.is.IsMethodDeclaration(declaration) || host.ast.is.IsMethodSignatureDeclaration(declaration)) &&
      host.ast.questionToken(declaration) === undefined
      ? getCsharpMethodValue(type)?.contract ?? type : type;
  };
  const nominalMethod = host.projectTypeCatalog.definitionContainingDeclaration(selection.source.selectedDeclaration) !== undefined &&
    (host.ast.is.IsMethodDeclaration(selection.source.selectedDeclaration) ||
      host.ast.is.IsMethodSignatureDeclaration(selection.source.selectedDeclaration));
  const nominalReceiver = host.projectTypeCatalog.definitionForTarget(receiverType)?.kind === "class";
  const structuralMemberType = nominalReceiver || nominalMethod ? undefined : host.structuralTypes.resolveSelectedProperty(
    receiverType,
    queries.facts.selectedSubjects(
      selection.source.selectedSymbol,
      selection.source.selectedDeclaration,
    ),
  );
  if (structuralMemberType !== undefined) {
    return optionalAccessTargetType(invocationType(structuralMemberType), selection.source.optionalChain);
  }
  return optionalAccessTargetType(
    invocationType(resolveSelectedDeclarationResult(
        selection.source.selectedDeclaration,
        state,
        receiverType,
      )),
    selection.source.optionalChain,
  );
}

export function resolveProjectThisTargetType(
  scope: CsharpTypeResolutionScope,
  node: Node,
): TargetTypeRef | undefined {
  if (scope.host.ast.kindName(node) !== "KindThisKeyword" && !scope.host.ast.is.IsThisTypeNode(node)) {
    return undefined;
  }
  return projectInstanceTargetTypeAt(scope, node);
}

// The receiver of a 'super(...)' call is the instance under construction: the enclosing class's own this, which
// reaches the base constructor through its heritage path. (The checked type of the super keyword in call position is
// the base constructor function, not an instance.)
export function resolveProjectConstructingReceiverTargetType(
  scope: CsharpTypeResolutionScope,
  superKeyword: Node,
): TargetTypeRef | undefined {
  return projectInstanceTargetTypeAt(scope, superKeyword);
}

function projectInstanceTargetTypeAt(
  { host }: CsharpTypeResolutionScope,
  node: Node,
): TargetTypeRef | undefined {
  let current = host.ast.parent(node);
  while (current !== undefined) {
    if (host.ast.is.IsArrowFunction(current)) {
      current = host.ast.parent(current);
      continue;
    }
    if (
      host.ast.is.IsFunctionDeclaration(current) ||
      host.ast.is.IsFunctionExpression(current)
    ) {
      return undefined;
    }
    if (
      host.ast.is.IsMethodDeclaration(current) ||
      host.ast.is.IsGetAccessorDeclaration(current) ||
      host.ast.is.IsSetAccessorDeclaration(current) ||
      host.ast.is.IsConstructorDeclaration(current) ||
      host.ast.is.IsPropertyDeclaration(current)
    ) {
      const ownerNode = host.ast.parent(current);
      if (
        ownerNode === undefined ||
        !host.ast.is.IsClassDeclaration(ownerNode) && !host.ast.is.IsClassExpression(ownerNode) ||
        host.ast.hasModifierKind(current, "static")
      ) {
        return undefined;
      }
      const owner = host.projectTypeCatalog.definitionForDeclaration(
        ownerNode,
      );
      return owner === undefined
        ? undefined
        : host.projectTypeCatalog.targetTypeForDeclaration(
            owner.declaration,
            owner.typeParameterBindings,
          );
    }
    if (host.ast.kindName(current) === "KindClassStaticBlockDeclaration") {
      return undefined;
    }
    current = host.ast.parent(current);
  }
  return undefined;
}

export function resolveSelectedReceiverTargetType(
  { resolveNodeWithState }: CsharpTypeResolutionScope,
  receiver: {
    readonly expression?: Node;
    readonly type?: Type;
  } | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveNodeWithState(receiver?.expression, queries.sourceFile, nextState(state));
}

export function resolveSourceOwnedConstructionResult(
  { host, projectSourceDeclarationTargetType, resolveSourceCallResultWithState,
    resolveNodeWithState, resolveSourceCallInstantiation }: CsharpTypeResolutionScope,
  source: NonNullable<
    ReturnType<SourceFileSemantics["operations"]["call"]>
  >,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const factory = getCsharpClassFactory(resolveNodeWithState(source.sourceCallee.expression, queries.sourceFile, nextState(state)));
  if (factory !== undefined) {
    const callable = host.representations.sourceCallable(source, queries.sourceFile, "checked");
    const instantiation = resolveSourceCallInstantiation(source, queries.sourceFile, nextState(state), undefined, callable);
    return instantiation === undefined ? undefined : substituteTargetTypeParameters(factory.instance, instantiation.substitutions);
  }
  const declaration = source.sourceCallee.selectedDeclaration;
  if (
    declaration === undefined ||
    !host.ast.is.IsClassDeclaration(declaration) ||
    !host.navigation.isProjectDeclaration(declaration)
  ) {
    return resolveSourceCallResultWithState(source, queries.sourceFile, state, undefined)?.selectedType;
  }
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const callable = host.representations.sourceCallable(source, queries.sourceFile, "checked");
  const instantiation = resolveSourceCallInstantiation(source, queries.sourceFile, nextState(state), undefined, callable);
  return instantiation === undefined
    ? undefined
    : projectSourceDeclarationTargetType(
        declaration,
        instantiation.arguments,
        selectedArguments.map(argument => argument.selectedType),
        state,
        source.sourceResultType,
      );
}
