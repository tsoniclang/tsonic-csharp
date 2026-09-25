import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { csharpNullableTargetType } from "../../../target-model/types/nullable.js";
import { nextState } from "./state.js";
import { resolveBinaryTargetRepresentation, commonTargetRepresentation, getTaskResultType } from "./representation.js";
import { selectCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "../../operations/members/selection/target-selection.js";
import { sourceOperatorFromKindName } from "../../../target-model/syntax/operators.js";
import { selectCsharpGenericMethodValue } from "../objects/generic-method-values.js";
import { getCsharpClassFactory } from "../../../target-model/types/class-factories.js";
import { substituteTargetTypeParameters } from "../callables/substitution.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/collections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpJsArrayTargetType } from "./surface-types.js";
import { selectedCsharpSourceProfileOwner } from "./source-profile.js";
import { selectCsharpAuthoredUnionRefinement } from "./source-union-refinement.js";

export function resolveSelectedExpressionType(
  { host, optionalAccessTargetType, policy, resolveNodeWithState, resolveTypeWithState, resolveReadStorage, resolveNonNullExpressionType, resolvePropertyAccessTargetType, resolveSelectedDeclarationResult, resolveSelectedReceiverTargetType, resolveSourceOwnedCallResult, resolveSourceOwnedConstructionResult }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (host.ast.is.IsArrayLiteralExpression(node)) {
    const sourceType = queries.types.expressionType(node);
    if (sourceType === undefined) return undefined;
    const sourceElements = host.ast.elements(node);
    const elements = sourceElements.map(element => {
      if (element === undefined) return undefined;
      if (!host.ast.is.IsSpreadElement(element)) {
        return resolveNodeWithState(element, queries.sourceFile, nextState(state));
      }
      const operand = host.ast.as.AsSpreadElement(element)?.Expression;
      return getCsharpCollectionElementTargetType(resolveNodeWithState(operand, queries.sourceFile, nextState(state)));
    });
    if (queries.types.isTuple(sourceType)) {
      if (sourceElements.some(element => element === undefined || host.ast.is.IsSpreadElement(element)) ||
        elements.some(element => element === undefined)) return undefined;
      const tuple = resolveTypeWithState(sourceType, queries.sourceFile, nextState(state));
      return tuple?.kind === "tuple" && tuple.elements.length === elements.length
        ? { ...tuple, elements: elements as readonly TargetTypeRef[] } : undefined;
    }
    const element = elements[0];
    if (element === undefined || elements.some(candidate => candidate === undefined || !targetTypeRefEquals(candidate, element))) {
      return undefined;
    }
    return selectedCsharpSourceProfileOwner(host.target) === "js"
      ? csharpJsArrayTargetType(element) : { kind: "array", element };
  }
  if (
    host.ast.is.IsAsExpression(node) ||
    host.ast.is.IsTypeAssertion(node)
  ) {
    const assertion = host.ast.is.IsAsExpression(node)
      ? host.ast.as.AsAsExpression(node)
      : host.ast.as.AsTypeAssertion(node);
    if (host.ast.isConstAssertion(node)) {
      return resolveNodeWithState(
        assertion?.Expression,
        queries.sourceFile,
        nextState(state),
      );
    }
    return resolveNodeWithState(
      assertion?.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (
    host.ast.is.IsParenthesizedExpression(node) ||
    host.ast.is.IsSatisfiesExpression(node)
  ) {
    const expression = host.ast.is.IsParenthesizedExpression(node)
      ? host.ast.as.AsParenthesizedExpression(node)?.Expression
      : host.ast.as.AsSatisfiesExpression(node)?.Expression;
    return resolveNodeWithState(
      expression,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsNonNullExpression(node)) {
    return resolveNonNullExpressionType(node, queries, state);
  }
  if (host.ast.is.IsConditionalExpression(node)) {
    const conditional = host.ast.as.AsConditionalExpression(node);
    return commonTargetRepresentation(
      resolveNodeWithState(
        conditional?.WhenTrue,
        queries.sourceFile,
        nextState(state),
      ),
      resolveNodeWithState(
        conditional?.WhenFalse,
        queries.sourceFile,
        nextState(state),
      ),
    );
  }
  if (host.ast.is.IsBinaryExpression(node)) {
    const binary = host.ast.as.AsBinaryExpression(node);
    const operator = sourceOperatorFromKindName(host.ast.operatorKindName(node));
    return resolveBinaryTargetRepresentation(
      host.ast,
      operator,
      binary?.Left,
      operator === "??=" ? resolveReadStorage(binary?.Left, queries.sourceFile) : resolveNodeWithState(
        binary?.Left,
        queries.sourceFile,
        nextState(state),
      ),
      binary?.Right,
      resolveNodeWithState(
        binary?.Right,
        queries.sourceFile,
        nextState(state),
      ),
    );
  }
  if (
    host.ast.is.IsPrefixUnaryExpression(node) ||
    host.ast.is.IsPostfixUnaryExpression(node)
  ) {
    const operand = host.ast.is.IsPrefixUnaryExpression(node)
      ? host.ast.as.AsPrefixUnaryExpression(node)?.Operand
      : host.ast.as.AsPostfixUnaryExpression(node)?.Operand;
    const operandType = resolveNodeWithState(
      operand,
      queries.sourceFile,
      nextState(state),
    );
    return sourceOperatorFromKindName(host.ast.operatorKindName(node)) === "!"
      ? csharpSourcePrimitiveTargetType("bool")
      : operandType;
  }
  if (host.ast.is.IsAwaitExpression(node)) {
    const awaited = resolveNodeWithState(
      host.ast.as.AsAwaitExpression(node)?.Expression,
      queries.sourceFile,
      nextState(state),
    );
    return awaited === undefined
      ? undefined
      : getTaskResultType(awaited);
  }
  if (
    host.ast.is.IsCallExpression(node) ||
    host.ast.is.IsNewExpression(node)
  ) {
    const selection = selectCsharpTargetCall(
      { ...host, projectTypes: host.projectTypes(), types: policy },
      node,
      queries.sourceFile,
    );
    if (selection.kind === "resolved") {
      const result = host.ast.is.IsNewExpression(node)
        ? selection.call.targetMember.declaringType ??
          selection.call.targetMember.returnType
        : selection.call.targetMember.returnType;
      return host.ast.is.IsNewExpression(node)
        ? result
        : optionalAccessTargetType(result, selection.source.optionalChain);
    }
    if (selection.kind === "source-owned") {
      const result = host.ast.is.IsNewExpression(node)
        ? resolveSourceOwnedConstructionResult(
            selection.source,
            queries,
            state,
          )
        : resolveSourceOwnedCallResult(selection.source, queries, state);
      return host.ast.is.IsNewExpression(node)
        ? result
        : optionalAccessTargetType(result, selection.source.optionalChain);
    }
    return undefined;
  }
  if (host.ast.is.IsPropertyAccessExpression(node)) {
    return resolvePropertyAccessTargetType(
      node,
      queries,
      state,
      "selected",
    );
  }
  if (host.ast.is.IsElementAccessExpression(node)) {
    const selection = selectCsharpTargetElement(
      { ...host, projectTypes: host.projectTypes(), types: policy },
      node,
      queries.sourceFile,
    );
    if (selection.kind === "resolved") {
      return optionalAccessTargetType(
        selection.targetMember.returnType,
        selection.source.optionalChain,
      );
    }
    if (selection.kind === "source-owned") {
      const receiver = resolveSelectedReceiverTargetType(
        selection.source.receiver,
        queries,
        state,
      );
      if (
        receiver?.kind === "tuple" &&
        selection.source.selectedElementIndex !== undefined
      ) {
        return optionalAccessTargetType(
          receiver.elements[selection.source.selectedElementIndex],
          selection.source.optionalChain,
        );
      }
      if (receiver?.kind === "array") {
        return optionalAccessTargetType(
          receiver.element,
          selection.source.optionalChain,
        );
      }
      return optionalAccessTargetType(
        resolveSelectedDeclarationResult(
          selection.source.selectedDeclaration,
          selection.source.sourceReadType ??
            selection.source.sourceWriteType,
          queries,
          state,
          receiver,
          queries.types.typeOfSymbol(selection.source.selectedSymbol),
        ),
        selection.source.optionalChain,
      );
    }
    return undefined;
  }
  return undefined;
}


export function resolvePropertyAccessTargetType(
  { host, optionalAccessTargetType, policy, resolveSelectedDeclarationResult, resolveSelectedReceiverTargetType, resolveSelectedSymbolType }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  mode: "selected" | "storage",
  selectedType?: Type,
): TargetTypeRef | undefined {
  const selection = selectCsharpTargetProperty(
    { ...host, projectTypes: host.projectTypes(), types: policy },
    node,
    queries.sourceFile,
  );
  if ((selection.kind === "resolved" || selection.kind === "source-owned") &&
    !selection.source.callCallee && selection.source.accessMode === "read" &&
    selection.source.sourceReadType !== undefined &&
    queries.types.callSignatures(selection.source.sourceReadType).some(signature => {
      const declaration = queries.declarations.signatureDeclaration(signature);
      return declaration !== undefined && host.ast.typeParameters(declaration).length > 0;
    })) {
    const receiverType = resolveSelectedReceiverTargetType(selection.source.receiver, queries, state);
    const methodValue = selectCsharpGenericMethodValue(receiverType, queries.facts.selectedSubjects(
      selection.source.selectedSymbol, selection.source.selectedDeclaration), host);
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
  const receiverType = resolveSelectedReceiverTargetType(
    selection.source.receiver,
    queries,
    state,
  );
  const selectedSourceType = mode === "selected"
    ? selectedType ?? selection.source.sourceReadType ?? selection.source.sourceWriteType
    : undefined;
  const declaredMemberType = queries.types.typeOfSymbol(selection.source.selectedSymbol);
  if (host.projectTypeCatalog.definitionContainingDeclaration(selection.source.selectedDeclaration) !== undefined) {
    const member = resolveSelectedDeclarationResult(selection.source.selectedDeclaration, selectedSourceType ?? declaredMemberType, queries, state, receiverType,
      declaredMemberType);
    if (member !== undefined) return optionalAccessTargetType(member, selection.source.optionalChain);
  }
  const structuralMemberType = host.structuralTypes.resolveSelectedProperty(
    receiverType,
    queries.facts.selectedSubjects(
      selection.source.selectedSymbol,
      selection.source.selectedDeclaration,
    ),
    selectedSourceType,
    queries.sourceFile,
    declaredMemberType,
  );
  const selectedSymbolType = selectedSourceType === undefined ||
      selection.source.selectedSymbol === undefined
    ? undefined
    : resolveSelectedSymbolType(
        selection.source.selectedSymbol,
        selectedSourceType,
        queries,
        state,
      );
  return optionalAccessTargetType(
    structuralMemberType ?? selectedSymbolType ??
      resolveSelectedDeclarationResult(
        selection.source.selectedDeclaration,
        selectedSourceType,
        queries,
        state,
        receiverType,
        declaredMemberType,
      ),
    selection.source.optionalChain,
  );
}


export function resolveNonNullExpressionType(
  { host, resolveNodeWithState, resolveTypeWithState }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const expression = host.ast.as.AsNonNullExpression(node)?.Expression;
  if (expression === undefined) {
    return undefined;
  }
  const sourceTarget = resolveNodeWithState(
    expression,
    queries.sourceFile,
    nextState(state),
  );
  const sourceType = queries.types.expressionType(expression);
  const selectedType = queries.types.expressionType(node);
  if (
    sourceTarget === undefined ||
    sourceType === undefined ||
    selectedType === undefined
  ) {
    return undefined;
  }
  if (queries.types.refinement(sourceType, selectedType).kind === "exact") {
    return sourceTarget;
  }
  const refinement = selectCsharpAuthoredUnionRefinement(
    sourceTarget, sourceType, selectedType, queries,
    type => resolveTypeWithState(type, queries.sourceFile, nextState(state)),
    host.structuralTypes.resolveTarget,
  );
  return refinement.kind === "resolved" ? refinement.type : undefined;
}


export function resolveProjectThisTargetType(
  { host }: CsharpTypeResolutionScope,
  node: Node,
): TargetTypeRef | undefined {
  if (host.ast.kindName(node) !== "KindThisKeyword") {
    return undefined;
  }
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
            owner.typeParameterNames.map((name) => ({
              kind: "type-parameter" as const,
              name,
            })),
          );
    }
    if (host.ast.kindName(current) === "KindClassStaticBlockDeclaration") {
      return undefined;
    }
    current = host.ast.parent(current);
  }
  return undefined;
}


export function resolveSourceOwnedCallResult(
  { resolveSourceCallResultWithState }: CsharpTypeResolutionScope,
  source: NonNullable<
    ReturnType<SourceFileSemantics["operations"]["call"]>
  >,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveSourceCallResultWithState(
    source,
    queries.sourceFile,
    state,
  );
}


export function resolveSelectedReceiverTargetType(
  { host, resolveNodeWithState, resolveTypeWithState }: CsharpTypeResolutionScope,
  receiver: {
    readonly expression?: Node;
    readonly type?: Type;
  } | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const expressionTarget = resolveNodeWithState(
    receiver?.expression,
    queries.sourceFile,
    nextState(state),
  );
  if (expressionTarget !== undefined) {
    return expressionTarget;
  }
  const semanticTarget = resolveTypeWithState(
    receiver?.type,
    queries.sourceFile,
    nextState(state),
  );
  if (semanticTarget !== undefined) {
    return semanticTarget;
  }
  if (
    receiver?.expression === undefined ||
    host.ast.kindName(receiver.expression) !== "KindThisKeyword"
  ) {
    return undefined;
  }
  const owner = host.projectTypeCatalog.definitionContainingDeclaration(
    receiver.expression,
  );
  return owner === undefined
    ? undefined
    : host.projectTypeCatalog.targetTypeForDeclaration(
        owner.declaration,
        owner.typeParameterNames.map((name) => ({
          kind: "type-parameter" as const,
          name,
        })),
      );
}


export function resolveSourceOwnedConstructionResult(
  { host, projectSourceDeclarationTargetType, resolveAuthoredAndSelectedSourceType, resolveSourceOwnedCallResult,
    resolveNodeWithState, resolveSourceCallInstantiation }: CsharpTypeResolutionScope,
  source: NonNullable<
    ReturnType<SourceFileSemantics["operations"]["call"]>
  >,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const factory = getCsharpClassFactory(resolveNodeWithState(source.sourceCallee.expression, queries.sourceFile, nextState(state)));
  if (factory !== undefined) {
    const callable = host.representations.sourceCallable(source, queries.sourceFile);
    const instantiation = resolveSourceCallInstantiation(source, queries.sourceFile, nextState(state), undefined, callable);
    return instantiation === undefined ? undefined : substituteTargetTypeParameters(factory.instance, instantiation.substitutions);
  }
  const declaration = source.sourceCallee.selectedDeclaration;
  if (
    declaration === undefined ||
    !host.ast.is.IsClassDeclaration(declaration) ||
    !host.navigation.isProjectDeclaration(declaration)
  ) {
    return resolveSourceOwnedCallResult(source, queries, state);
  }
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const targetArguments = selectedArguments.map((argument) => {
    const authoredSourceFile = host.ast.getSourceFile(
      argument.explicitTypeNode,
    ) ?? queries.sourceFile;
    return resolveAuthoredAndSelectedSourceType(
      argument.explicitTypeNode,
      authoredSourceFile,
      argument.selectedType,
      queries.sourceFile,
      nextState(state),
    );
  });
  return targetArguments.some((argument) => argument === undefined)
    ? undefined
    : projectSourceDeclarationTargetType(
        declaration,
        targetArguments as readonly TargetTypeRef[],
        selectedArguments.map(argument => argument.selectedType),
        state,
        source.sourceResultType,
      );
}


export function optionalAccessTargetType(
  {  }: CsharpTypeResolutionScope,
  type: TargetTypeRef | undefined,
  optionalChain: boolean,
): TargetTypeRef | undefined {
  return type === undefined || !optionalChain
    ? type
    : csharpNullableTargetType(type);
}
