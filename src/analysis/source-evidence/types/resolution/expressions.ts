import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../../target-model/types/carriers/scalar-types.js";

import { nextState } from "./state.js";
import { resolveBinaryTargetRepresentation, commonTargetRepresentation } from "../../../../policy/types/resolution/representation.js";
import { selectCsharpSourceCallAwaitCompletion } from "../../../../policy/operations/control-flow/await-completions.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
import { selectFormedCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "../../../operations/members/selected-members.js";
import { isCsharpAssignmentOperator, sourceOperatorFromKindName } from "../../../../target-model/syntax/operators.js";
import { selectCsharpMethodValue } from "../../../objects/method-values.js";
import { getCsharpMethodValue } from "../../../../target-model/types/method-values.js";
import { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { selectCsharpAuthoredUnionRefinement } from "./source-union-refinement.js";
import { resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { selectCsharpConditionalNumericCarrier } from "../../../../policy/types/conditional-numeric-carrier.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { resolveCsharpStaticMemberReceiver } from "../../../../policy/types/project/static-members.js";
import { csharpAbsenceTargetType, combineCsharpTargetUnionMembers, isCsharpJsValueTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { resolveCsharpContextualLiteralCarrier } from "./contextual-literals.js";
import { resolveCsharpSourceLiteralTargetType } from "../../../../policy/conversions/source-literals.js";
import { formCsharpSelectedExpressionSource,
  type CsharpSelectedExpressionSource, type CsharpSourceOwnedConstructionSource } from "./expression-source.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import { completeCsharpSelectedReceiver } from "./receiver-completions.js";

export function resolveSelectedExpressionType(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveSelectedExpressionResult(scope, node, queries, state)?.selectedType;
}

export function resolveSelectedExpressionResult(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  return resolveFormedCsharpSelectedExpressionResult(scope, formCsharpSelectedExpressionSource(scope, node, queries, state));
}

export function resolveFormedCsharpSelectedExpressionResult(
  scope: CsharpTypeResolutionScope,
  source: CsharpSelectedExpressionSource,
): CsharpSourceCallResult | undefined {
  const { host, policy, optionalAccessTargetType } = scope;
  const { node, queries, state } = source;
  if (source.kind === "transparent") {
    return scope.resolveNodeValueWithState(source.expression, queries.sourceFile, nextState(state));
  }
  if (source.kind === "call") {
    const selection = selectFormedCsharpTargetCall({ ...host, projectTypes: host.projectTypes(), types: policy }, source.selection);
    if (selection.kind === "resolved") {
      const result = source.isNew
        ? selection.call.targetMember.declaringType ?? selection.call.targetMember.returnType
        : selection.call.discardResult ? csharpVoidTargetType() : selection.call.targetMember.returnType;
      if (source.isNew) return csharpSourceValueResult(result);
      const selected = resolveSelectedCallResult(scope, source, selection.source, result);
      return refineCsharpSourceValueResult(selected, optionalAccessTargetType(selected?.selectedType, selection.source.optionalChain));
    }
    if (selection.kind === "source-owned") {
      if (source.isNew) {
        const construction = source.construction;
        if (construction === undefined || construction.contract !== source.contract ||
          construction.contract.source !== selection.source || construction.queries !== queries) {
          return failTargetAnalysisInvariant("tsonic-csharp",
            "Construction completion requires its exact retained callable source.", node);
        }
        return csharpSourceValueResult(resolveFormedCsharpSourceOwnedConstructionResult(scope, construction, state));
      }
      const selected = resolveSelectedCallResult(scope, source, selection.source, undefined);
      return refineCsharpSourceValueResult(selected, optionalAccessTargetType(selected?.selectedType, selection.source.optionalChain));
    }
    return undefined;
  }
  return csharpSourceValueResult(resolveSelectedExpressionCarrier(scope, node, queries, state));
}

function resolveSelectedCallResult(
  scope: CsharpTypeResolutionScope,
  source: Extract<CsharpSelectedExpressionSource, { readonly kind: "call" }>,
  checked: ResolvedSourceCallInfo,
  nativeType: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  const input = source.resultSource;
  if (input === undefined || input.contract !== source.contract || input.source !== checked ||
    input.sourceFile !== source.queries.sourceFile) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Call result completion requires its exact retained checked occurrence.", source.node);
  }
  return scope.resolveFormedSourceCallResultWithState(input, source.state, nativeType);
}

function resolveSelectedExpressionCarrier(
  { host, resolveNodeWithState, resolveNodeValueWithState, resolveReadStorage, resolveNonNullExpressionType, resolveMemberAccessTargetType, sourceUnions }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
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
    const asserted = resolveNodeWithState(
      assertion?.Type,
      queries.sourceFile,
      nextState(state),
    );
    const source = resolveNodeWithState(assertion?.Expression, queries.sourceFile, nextState(state));
    if (asserted === undefined || source === undefined) return undefined;
    return isCsharpJsValueTargetType(source) && asserted.kind === "target-named" && (asserted as CsharpTargetNamedTypeRef).csharpStructuralContract === true
      ? source : asserted;
  }
  if (host.ast.is.IsNonNullExpression(node)) {
    return resolveNonNullExpressionType(node, queries, state);
  }
  if (host.ast.is.IsConditionalExpression(node)) {
    const conditional = host.ast.as.AsConditionalExpression(node);
    if (conditional?.WhenTrue === undefined || conditional.WhenFalse === undefined) return undefined;
    const trueCarrier = resolveNodeWithState(conditional.WhenTrue, queries.sourceFile, nextState(state));
    const falseCarrier = resolveNodeWithState(conditional.WhenFalse, queries.sourceFile, nextState(state));
    const left = resolveCsharpContextualLiteralCarrier(host, conditional.WhenTrue, falseCarrier) ?? trueCarrier;
    const right = resolveCsharpContextualLiteralCarrier(host, conditional.WhenFalse, trueCarrier) ?? falseCarrier;
    const common = selectCsharpConditionalNumericCarrier(conditional.WhenTrue, conditional.WhenFalse, left, right, host.literalValues) ??
      commonTargetRepresentation(left, right);
    if (common !== undefined) return common;
    if (left === undefined || right === undefined) return undefined;
    const trueType = queries.types.expressionType(conditional.WhenTrue);
    const falseType = queries.types.expressionType(conditional.WhenFalse);
    if (trueType === undefined || falseType === undefined) return undefined;
    const trueSource = queries.types.literalBaseType(trueType);
    const falseSource = queries.types.literalBaseType(falseType);
    if (trueSource === undefined || falseSource === undefined) return undefined;
    return sourceUnions.retain(combineCsharpTargetUnionMembers([left, right]), [
      { source: trueSource, carrier: left },
      { source: falseSource, carrier: right },
    ], queries, state);
  }
  if (host.ast.is.IsBinaryExpression(node)) {
    const binary = host.ast.as.AsBinaryExpression(node);
    const operator = sourceOperatorFromKindName(host.ast.operatorKindName(node));
    const left = operator !== undefined && isCsharpAssignmentOperator(operator) ? resolveReadStorage(binary?.Left, queries.sourceFile)
      : resolveNodeWithState(binary?.Left, queries.sourceFile, nextState(state));
    const expected = operator === "??" || operator === "??="
      ? getCsharpNullableElementTargetType(left) ?? left : undefined;
    const right = resolveCsharpContextualLiteralCarrier(host, binary?.Right, expected) ??
      resolveNodeWithState(binary?.Right, queries.sourceFile, nextState(state));
    return resolveBinaryTargetRepresentation(
      host.ast,
      host.literalValues,
      operator,
      binary?.Left,
      left,
      binary?.Right,
      right,
    );
  }
  if (
    host.ast.is.IsPrefixUnaryExpression(node) ||
    host.ast.is.IsPostfixUnaryExpression(node)
  ) {
    const literal = host.literalValues.literalValue.get(node);
    const literalType = literal?.numeric?.kind === "authored"
      ? resolveCsharpSourceLiteralTargetType(host, literal) : undefined;
    if (literalType !== undefined) return literalType;
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
    const awaited = resolveNodeValueWithState(
      host.ast.as.AsAwaitExpression(node)?.Expression,
      queries.sourceFile,
      nextState(state),
    );
    return awaited === undefined
      ? undefined
      : selectCsharpSourceCallAwaitCompletion(awaited, host.typeDefinitions,
        host.navigation.expressionResultUse(node))?.result;
  }
  if (host.ast.is.IsPropertyAccessExpression(node) || host.ast.is.IsElementAccessExpression(node)) {
    return resolveMemberAccessTargetType(node, queries, state, "selected");
  }
  return undefined;
}

export function resolveMemberAccessTargetType(
  { host, optionalAccessTargetType, policy, resolveSelectedDeclarationResult, resolveSelectedReceiverTargetType, resolveSelectedSymbolType, resolveSelectedValueWithState }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  mode: "selected" | "storage",
  selectedType?: Type,
): TargetTypeRef | undefined {
  const selectionHost = { ...host, projectTypes: host.projectTypes(), types: policy };
  const selection = host.ast.is.IsElementAccessExpression(node)
    ? selectCsharpTargetElement(selectionHost, node, queries.sourceFile)
    : selectCsharpTargetProperty(selectionHost, node, queries.sourceFile);
  if (selection.kind === "project-indexer") return optionalAccessTargetType(
    mode === "selected" ? selection.selectedReadType ?? selection.valueType : selection.valueType, selection.source.optionalChain);
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
  const selectedSourceType = mode === "selected"
    ? selectedType ?? selection.source.sourceReadType ?? selection.source.sourceWriteType
    : undefined;
  if (selectedSourceType !== undefined && queries.types.isNullish(selectedSourceType) &&
    selection.source.sourceReadType !== undefined && queries.types.isNullish(selection.source.sourceReadType)) {
    return csharpAbsenceTargetType();
  }
  const declaredMemberType = queries.types.typeOfSymbol(selection.source.selectedSymbol);
  if (selection.source.selectedDeclaration !== undefined && host.ast.is.IsBindingElement(selection.source.selectedDeclaration)) {
    const selected = selectedSourceType ?? declaredMemberType;
    const projected = mode === "storage" || selected === undefined
      ? host.bindingProjection(selection.source.selectedDeclaration, queries.sourceFile)?.bindingCarrier
      : resolveSelectedValueWithState(node, selected, queries.sourceFile, nextState(state));
    return optionalAccessTargetType(projected, selection.source.optionalChain);
  }
  const invocationType = (type: TargetTypeRef | undefined): TargetTypeRef | undefined => {
    const declaration = selection.source.selectedDeclaration;
    return selection.source.callCallee && declaration !== undefined &&
      (host.ast.is.IsMethodDeclaration(declaration) || host.ast.is.IsMethodSignatureDeclaration(declaration)) &&
      host.ast.questionToken(declaration) === undefined
      ? getCsharpMethodValue(type)?.contract ?? type : type;
  };
  const nominalMethod = host.projectTypeCatalog.declarationContaining(selection.source.selectedDeclaration) !== undefined &&
    (host.ast.is.IsMethodDeclaration(selection.source.selectedDeclaration) ||
      host.ast.is.IsMethodSignatureDeclaration(selection.source.selectedDeclaration));
  const nominalReceiver = host.projectTypeCatalog.declarationForTarget(receiverType)?.kind === "class";
  const structuralMemberType = nominalReceiver || nominalMethod ? undefined : host.structuralTypes.resolveSelectedProperty(
    receiverType,
    queries.facts.selectedSubjects(
      selection.source.selectedSymbol,
      selection.source.selectedDeclaration,
    ),
    selectedSourceType,
    queries.sourceFile,
    declaredMemberType,
  );
  if (structuralMemberType !== undefined) {
    return optionalAccessTargetType(invocationType(structuralMemberType), selection.source.optionalChain);
  }
  if (host.projectTypeCatalog.declarationContaining(selection.source.selectedDeclaration) !== undefined) {
    const member = resolveSelectedDeclarationResult(selection.source.selectedDeclaration, selectedSourceType ?? declaredMemberType, queries, state, receiverType,
      declaredMemberType);
    return member === undefined ? undefined : optionalAccessTargetType(invocationType(member), selection.source.optionalChain);
  }
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
    invocationType(selectedSymbolType ??
      resolveSelectedDeclarationResult(
        selection.source.selectedDeclaration,
        selectedSourceType ?? declaredMemberType,
        queries,
        state,
        receiverType,
        declaredMemberType,
      )),
    selection.source.optionalChain,
  );
}

export function resolveNonNullExpressionType(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveNodeWithState } = scope;
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
  const genericOptional = getCsharpGenericOptionalParts(sourceTarget);
  if (genericOptional !== undefined) return genericOptional.element;
  if (sourceTarget.kind === "type-parameter") return sourceTarget;
  if (queries.types.refinement(sourceType, selectedType).kind === "exact") {
    return sourceTarget;
  }
  const refinement = selectCsharpAuthoredUnionRefinement(
    sourceTarget, sourceType, selectedType, queries,
    type => resolveCsharpUnionMemberCarrier(scope, sourceTarget, type, queries, state),
    host.structuralTypes.resolveTarget,
    host.typeDefinitions,
  );
  return refinement.kind === "resolved" ? refinement.type : undefined;
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
  scope: CsharpTypeResolutionScope,
  receiver: {
    readonly expression?: Node;
    readonly type?: Type;
  } | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return completeCsharpSelectedReceiver(scope, Object.freeze({ receiver, queries, state }))?.type;
}

export function resolveFormedCsharpSourceOwnedConstructionResult(
  { host, projectSourceDeclarationTargetType, resolveFormedSourceCallResultWithState,
    resolveNodeWithState, resolveSourceCallInstantiation }: CsharpTypeResolutionScope,
  input: CsharpSourceOwnedConstructionSource,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { contract, queries } = input;
  const { source, sourceFile, callableSource } = contract;
  if (callableSource.source !== source || callableSource.sourceFile !== sourceFile || queries.sourceFile !== sourceFile) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Construction completion requires its exact checked callable occurrence.", source.call);
  }
  const factory = getCsharpClassFactory(resolveNodeWithState(source.sourceCallee.expression, queries.sourceFile, nextState(state)));
  if (factory !== undefined) {
    const callable = host.representations.completeSourceCallable(callableSource, "checked");
    const instantiation = resolveSourceCallInstantiation(source, queries.sourceFile, nextState(state), undefined, callable);
    return instantiation === undefined ? undefined : substituteTargetTypeParameters(factory.instance, instantiation.substitutions);
  }
  const declaration = callableSource.constructorDeclaration;
  if (declaration === undefined || !input.projectDeclaration) {
    const result = input.resultSource;
    if (result === undefined || result.contract !== contract) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Construction fallback requires its exact retained result request.", source.call);
    }
    return resolveFormedSourceCallResultWithState(result, state, undefined)?.selectedType;
  }
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const callable = host.representations.completeSourceCallable(callableSource, "checked");
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
