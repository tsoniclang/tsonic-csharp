import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import { sourcePresentCallableType, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { csharpNullableTargetType } from "../../../target-model/types/nullable.js";
import { nextState } from "./state.js";
import { resolveBinaryTargetRepresentation, commonTargetRepresentation, getTaskResultType } from "./representation.js";
import { selectCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "../../operations/members/selection/target-selection.js";
import { isCsharpAssignmentOperator, sourceOperatorFromKindName } from "../../../target-model/syntax/operators.js";
import { selectCsharpMethodValue } from "../objects/method-values.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { getCsharpClassFactory } from "../../../target-model/types/class-factories.js";
import { substituteTargetTypeParameters } from "../../../target-model/types/substitution.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/collections.js";
import { csharpJsArrayTargetType } from "./surface-types.js";
import { selectedCsharpSourceProfileOwner } from "./source-profile.js";
import { selectCsharpAuthoredUnionRefinement } from "./source-union-refinement.js";
import { resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { selectCsharpConditionalNumericCarrier } from "../conditional-numeric-carrier.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { combineCsharpTargetUnionMembers, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { resolveCsharpContextualLiteralCarrier } from "./contextual-literals.js";

export function resolveSelectedExpressionType(
  { host, optionalAccessTargetType, policy, resolveNodeWithState, resolveTypeWithState, resolveReadStorage, resolveNonNullExpressionType, resolveMemberAccessTargetType, resolveSourceOwnedCallResult, resolveSourceOwnedConstructionResult, resolveSourceCallResultWithState, sourceUnions }: CsharpTypeResolutionScope,
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
    if (elements.length === 0 || elements.some(candidate => candidate === undefined)) return undefined;
    const sourceElement = getCsharpCollectionElementTargetType(resolveTypeWithState(sourceType, queries.sourceFile, nextState(state)));
    const element = isCsharpJsValueTargetType(sourceElement) ? sourceElement
      : combineCsharpTargetUnionMembers(elements as readonly TargetTypeRef[]);
    if (element === undefined) return undefined;
    const members = sourceElements.map((entry, index) => {
      if (entry === undefined) return undefined;
      const spread = host.ast.is.IsSpreadElement(entry);
      const operand = spread ? host.ast.as.AsSpreadElement(entry)?.Expression : entry;
      const selected = operand === undefined ? undefined : queries.types.expressionType(operand);
      const type = selected === undefined ? undefined : spread ? queries.types.typeArguments(selected)[0] : selected;
      const source = type === undefined ? undefined : queries.types.literalBaseType(type);
      const carrier = elements[index];
      return source === undefined || carrier === undefined ? undefined : { source, carrier };
    });
    if (members.some(member => member === undefined)) return undefined;
    const retained = sourceUnions.retain(element, members.filter(member => member !== undefined), queries, state);
    if (retained === undefined) return undefined;
    return selectedCsharpSourceProfileOwner(host.target) === "js"
      ? csharpJsArrayTargetType(retained) : { kind: "array", element: retained };
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
    if (conditional?.WhenTrue === undefined || conditional.WhenFalse === undefined) return undefined;
    const trueCarrier = resolveNodeWithState(conditional.WhenTrue, queries.sourceFile, nextState(state));
    const falseCarrier = resolveNodeWithState(conditional.WhenFalse, queries.sourceFile, nextState(state));
    const left = resolveCsharpContextualLiteralCarrier(host, conditional.WhenTrue, falseCarrier) ?? trueCarrier;
    const right = resolveCsharpContextualLiteralCarrier(host, conditional.WhenFalse, trueCarrier) ?? falseCarrier;
    const common = selectCsharpConditionalNumericCarrier(conditional.WhenTrue, conditional.WhenFalse, left, right, host.ast) ??
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
      : getTaskResultType(awaited, host.typeDefinitions);
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
        : optionalAccessTargetType(resolveSourceCallResultWithState(selection.source, queries.sourceFile, state, result)?.selectedType,
            selection.source.optionalChain);
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
  if (host.ast.is.IsPropertyAccessExpression(node) || host.ast.is.IsElementAccessExpression(node)) {
    return resolveMemberAccessTargetType(node, queries, state, "selected");
  }
  return undefined;
}


export function resolveMemberAccessTargetType(
  { host, optionalAccessTargetType, policy, resolveSelectedDeclarationResult, resolveSelectedReceiverTargetType, resolveSelectedSymbolType }: CsharpTypeResolutionScope,
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
  const presentCallable = selection.kind === "resolved" || selection.kind === "source-owned"
    ? sourcePresentCallableType(selection.source.sourceReadType, queries) : undefined;
  if ((selection.kind === "resolved" || selection.kind === "source-owned") && selection.source.accessMode === "read" &&
    presentCallable !== undefined && (queries.types.relationship(presentCallable, selection.source.sourceReadType!) !== "identical" ||
    queries.types.callSignatures(presentCallable).some(signature => {
      const declaration = queries.declarations.signatureDeclaration(signature);
      return declaration !== undefined && host.ast.typeParameters(declaration).length > 0;
    }))) {
    const receiverType = resolveSelectedReceiverTargetType(selection.source.receiver, queries, state);
    const methodValue = selectCsharpMethodValue(receiverType, queries.facts.selectedSubjects(
      selection.source.selectedSymbol, selection.source.selectedDeclaration), host, selection.source.callCallee);
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
  if (host.ast.is.IsElementAccessExpression(node)) {
    const index = "selectedElementIndex" in selection.source ? selection.source.selectedElementIndex : undefined;
    if (receiverType?.kind === "tuple" && index !== undefined)
      return optionalAccessTargetType(receiverType.elements[index], selection.source.optionalChain);
    if (receiverType?.kind === "array") return optionalAccessTargetType(receiverType.element, selection.source.optionalChain);
  }
  const selectedSourceType = mode === "selected"
    ? selectedType ?? selection.source.sourceReadType ?? selection.source.sourceWriteType
    : undefined;
  const declaredMemberType = queries.types.typeOfSymbol(selection.source.selectedSymbol);
  const invocationType = (type: TargetTypeRef | undefined): TargetTypeRef | undefined => {
    const declaration = selection.source.selectedDeclaration;
    return selection.source.callCallee && declaration !== undefined &&
      (host.ast.is.IsMethodDeclaration(declaration) || host.ast.is.IsMethodSignatureDeclaration(declaration)) &&
      host.ast.questionToken(declaration) === undefined
      ? getCsharpMethodValue(type)?.contract ?? type : type;
  };
  if (host.projectTypeCatalog.definitionContainingDeclaration(selection.source.selectedDeclaration) !== undefined) {
    const member = resolveSelectedDeclarationResult(selection.source.selectedDeclaration, selectedSourceType ?? declaredMemberType, queries, state, receiverType,
      declaredMemberType);
    return member === undefined ? undefined : optionalAccessTargetType(invocationType(member), selection.source.optionalChain);
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
    invocationType(structuralMemberType ?? selectedSymbolType ??
      resolveSelectedDeclarationResult(
        selection.source.selectedDeclaration,
        selectedSourceType,
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
  { host }: CsharpTypeResolutionScope,
  node: Node,
): TargetTypeRef | undefined {
  if (host.ast.kindName(node) !== "KindThisKeyword" && !host.ast.is.IsThisTypeNode(node)) {
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
    undefined,
  )?.selectedType;
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
        owner.typeParameterBindings,
      );
}


export function resolveSourceOwnedConstructionResult(
  { host, projectSourceDeclarationTargetType, resolveSourceOwnedCallResult,
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
    return resolveSourceOwnedCallResult(source, queries, state);
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


export function optionalAccessTargetType(
  {  }: CsharpTypeResolutionScope,
  type: TargetTypeRef | undefined,
  optionalChain: boolean,
): TargetTypeRef | undefined {
  return type === undefined || !optionalChain
    ? type
    : csharpNullableTargetType(type);
}
