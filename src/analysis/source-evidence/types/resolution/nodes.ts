import type { CsharpTypeResolutionScope } from "./scope.js";
import { resolveCsharpConstructorValueType } from "./constructors.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { IsTypeSyntaxNode, sourceTypeDescriptorsEqual, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { maximumTypeResolutionDepth } from "./model.js";
import { failTargetCompilerResourceLimit } from "@tsonic/target-api/artifacts";
import { nextState } from "./state.js";
import { resolveKeywordType } from "../../../../policy/types/resolution/source-primitives.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";

import { resolveCsharpProviderIndexedAccess } from "./indexed-access.js";
import { csharpSourceStorageContext, csharpSourceStorageComponentContext } from "./source-storage-projection.js";

import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import { resolveCsharpNativeParameterCarrier, selectCsharpPublishedParameterCarrier } from "./source-references.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
import { resolveCsharpSourceEffectiveType, type CsharpEffectiveSourceTypeSelection } from "./effective-types.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpCallableValueType, csharpClosedInvocationMatches } from "../../../../policy/types/callables/value-type.js";
import { selectCsharpPublishedMethodValue } from "../../../objects/method-values.js";
export function resolveNodeValueWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  const selected = resolveNodeResultWithState(scope, node, sourceFile, state);
  return node === undefined ? selected : refineCsharpSourceValueResult(selected,
    resolveCsharpNativeParameterCarrier(scope, node, selected?.selectedType, state));
}

function resolveNodeResultWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  const { host, resolveCallableType, selectDirectSourceFacts, resolveNodeWithState, resolveProjectThisTargetType, resolveTupleTypeNode, resolveTypeReferenceNode, resolveTypeWithState } = scope;
  if (node === undefined) return undefined;
  const effective = resolveCsharpSourceEffectiveType(scope, node, state);
  if (effective !== undefined) {
    if (effective.result === undefined) return undefined;
    const method = selectedPublishedMethodRead(scope, node, sourceFile, effective, state);
    if (method !== undefined) return Object.freeze({ ...effective.result, nativeType: method, selectedType: method });
    const physical = selectedClosedCallableRead(scope, node, effective);
    if (physical !== undefined) return Object.freeze({ ...effective.result, nativeType: physical, selectedType: physical });
    if (!host.ast.is.IsArrayLiteralExpression(node)) return effective.result;
    const queries = sourceFile === undefined ? host.semanticsFor(node) : host.semantics(sourceFile);
    const selection = scope.resolveArrayLiteralWithState(node, queries, state);
    if (selection.kind === "unavailable") return undefined;
    const literalAdmission = selection.kind === "rejected"
      ? selection
      : Object.freeze({ kind: "resolved" as const, type: selection.carrier });
    if (literalAdmission.kind === "rejected") state.rejectNativeResolution?.(literalAdmission);
    return Object.freeze({ ...effective.result, literalAdmission });
  }
  if (!IsTypeSyntaxNode(host.ast, node) && !host.ast.is.IsTypeLiteralNode(node) &&
    !host.ast.is.IsNamedTupleMember(node) && !host.ast.is.IsExpressionWithTypeArguments(node) &&
    !host.ast.is.IsTypeParameterDeclaration(node)) return undefined;
  if (state.depth > maximumTypeResolutionDepth) failTargetCompilerResourceLimit("tsonic-csharp",
    "Selected native source-node type resolution", "depth", maximumTypeResolutionDepth, node);
  state = csharpSourceStorageContext(host, state, node);
  if (
    host.ast.is.IsSourceFile(node) ||
    host.ast.is.IsImportDeclaration(node) ||
    host.ast.is.IsImportClause(node) ||
    host.ast.kindName(node) === "KindEndOfFile"
  ) {
    return undefined;
  }
  const queries = sourceFile === undefined
    ? host.semanticsFor(node)
    : host.semantics(sourceFile);
  if (host.ast.is.IsTypeParameterDeclaration(node)) {
    const parameter = csharpSourceTypeParameter(node, host.ast);
    return parameter === undefined ? undefined
      : csharpSourceValueResult(host.typeParameterConstraints.resolve(parameter));
  }
  const scopedTargetType = host.representations.scopedTargetType(node);
  if (scopedTargetType !== undefined) {
    return csharpSourceValueResult(scopedTargetType);
  }
  const indexedAccess = resolveCsharpProviderIndexedAccess(scope, node, queries, state);
  if (indexedAccess !== undefined) return csharpSourceValueResult(indexedAccess);
  const syntaxFact = selectDirectSourceFacts(
    [node],
    queries.sourceFile,
    state,
  );
  if (syntaxFact.kind !== "not-applicable") return syntaxFact.kind === "resolved" ? csharpSourceValueResult(syntaxFact.type) : undefined;
  const contextualParameter = selectCsharpPublishedParameterCarrier(scope, node, state);
  if (contextualParameter.kind !== "not-applicable") return contextualParameter.kind === "resolved"
    ? csharpSourceValueResult(contextualParameter.type) : undefined;
  const direct = selectDirectSourceFacts(
    sourceFactSubjectsForNode(node, host.navigation),
    queries.sourceFile,
    state,
  );
  if (direct.kind !== "not-applicable") return direct.kind === "resolved" ? csharpSourceValueResult(direct.type) : undefined;
  const scalar = resolveKeywordType(host.ast.kindName(node));
  if (scalar !== undefined) {
    return csharpSourceValueResult(scalar);
  }
  if (host.ast.is.IsFunctionTypeNode(node)) {
    const selected = queries.types.authoredType(node);
    return selected === undefined ? undefined : csharpSourceValueResult(resolveCallableType(selected, queries, state));
  }
  if (host.ast.is.IsArrayTypeNode(node)) {
    const element = resolveNodeWithState(
      host.ast.as.AsArrayTypeNode(node)!.ElementType,
      queries.sourceFile,
      nextState(csharpSourceStorageComponentContext(host, state, { kind: "array-element" })),
    );
    const carrier = element === undefined
      ? resolveTypeWithState(queries.types.authoredType(node), queries.sourceFile, nextState(state))
      : selectedCsharpSourceProfileOwner(host.target) === "js" ? csharpJsArrayTargetType(element)
        : { kind: "array" as const, element };
    return csharpSourceValueResult(carrier);
  }
  if (host.ast.is.IsTupleTypeNode(node)) {
    return csharpSourceValueResult(resolveTupleTypeNode(node, queries, state));
  }
  if (host.ast.is.IsUnionTypeNode(node)) {
    return undefined;
  }
  if (host.ast.is.IsNamedTupleMember(node)) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsNamedTupleMember(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsParenthesizedTypeNode(node)) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsParenthesizedTypeNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsOptionalTypeNode(node)) {
    const inner = resolveNodeWithState(
      host.ast.as.AsOptionalTypeNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
    return inner === undefined ? undefined : csharpSourceValueResult(csharpNullableTargetType(inner));
  }
  if (host.ast.is.IsRestTypeNode(node)) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsRestTypeNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (
    host.ast.is.IsTypeOperatorNode(node) &&
    host.ast.operatorKindName(node) === "KindReadonlyKeyword"
  ) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsTypeOperatorNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsTypeReferenceNode(node)) {
    const resolved = resolveTypeReferenceNode(node, queries, state);
    if (resolved !== undefined) {
      return csharpSourceValueResult(resolved);
    }
  }
  const projectThis = resolveProjectThisTargetType(node);
  if (projectThis !== undefined) {
    return csharpSourceValueResult(projectThis);
  }
  return csharpSourceValueResult(resolveFallbackNodeCarrier(scope, node, queries, state));
}

function resolveFallbackNodeCarrier(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveProjectSourceType, resolveTypeWithState } = scope;
  if (!host.ast.is.IsClassDeclaration(node) && !host.ast.is.IsInterfaceDeclaration(node)) {
    const constructor = resolveCsharpConstructorValueType(scope, queries.types.authoredType(node), queries, state);
    if (constructor !== undefined) return constructor;
  }
  const projectType = resolveProjectSourceType(node, queries.sourceFile, state);
  if (projectType !== undefined) {
    return projectType;
  }
  const structuralType = host.structuralTypes.resolveNode(
    node,
    queries.sourceFile,
    nextState(state),
  );
  if (structuralType !== undefined) {
    return structuralType;
  }
  const reference = host.navigation.referenceFor(node);
  const declaration = reference?.declaration;
  const typeNode = declaration === undefined ? undefined : host.ast.typeNode(declaration);
  return typeNode === undefined ? resolveTypeWithState(queries.types.authoredType(node), queries.sourceFile, nextState(state))
    : scope.resolveAuthoredAndSelectedSourceType(typeNode, host.ast.getSourceFile(typeNode) ?? queries.sourceFile,
      queries.types.authoredType(node), queries.sourceFile, nextState(state));
}

function selectedPublishedMethodRead(
  scope: CsharpTypeResolutionScope, node: Node, sourceFile: SourceFile | undefined,
  effective: CsharpEffectiveSourceTypeSelection, state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host } = scope;
  if (effective.result === undefined) return undefined;
  const method = host.effectiveTypes.methodValueUse(node);
  if (method === undefined || method.occurrence !== node) return undefined;
  const owner = scope.resolveNodeWithState(method.receiver, sourceFile, nextState(state));
  return selectCsharpPublishedMethodValue(owner, method.declaration, effective.result.selectedType, host);
}

function selectedClosedCallableRead(
  { host }: CsharpTypeResolutionScope,
  node: Node,
  effective: CsharpEffectiveSourceTypeSelection,
): TargetTypeRef | undefined {
  if (effective.result === undefined || effective.outcome.kind === "refused" ||
    effective.outcome.type.kind !== "callable") return undefined;
  const declaration = host.ast.is.IsIdentifier(node) ? host.navigation.sourceReferenceFor(node)?.declaration
    : host.ast.is.IsVariableDeclaration(node) || host.ast.is.IsArrowFunction(node) ||
      host.ast.is.IsFunctionExpression(node) ? node : undefined;
  if (declaration === undefined) return undefined;
  const principal = host.effectiveTypes.get(declaration);
  if (principal === undefined || principal.kind === "refused" || principal.provenance.occurrence !== declaration ||
    !sourceTypeDescriptorsEqual(effective.outcome.type, principal.type)) return undefined;
  const selected = host.representations.scopedTargetType(node);
  const storage = host.representations.scopedTargetType(declaration);
  if (selected === undefined || storage === undefined || !targetTypeRefEquals(selected, storage)) return undefined;
  if (effective.outcome.type.kind !== "callable" || host.ast.is.IsVariableDeclaration(declaration) &&
    host.ast.typeNode(declaration) !== undefined) return undefined;
  const contract = host.representations.closedInputContract(node);
  if (contract === undefined || host.representations.closedInputContract(declaration) !== contract ||
    host.representations.closedInputContract(contract.sourceDeclaration) !== contract ||
    contract.sourceDeclaration !== declaration &&
      !host.navigation.expressionValueFlow(contract.sourceDeclaration).aliasDeclarations.includes(declaration) &&
      !host.navigation.declarationUses(contract.sourceDeclaration).some(use =>
        host.navigation.expressionValueFlow(use.reference).aliasDeclarations.includes(declaration))) return undefined;
  const native = csharpCallableValueType(contract);
  return native !== undefined && csharpClosedInvocationMatches(native, selected) &&
    csharpClosedInvocationMatches(effective.result.selectedType, selected) ? selected : undefined;
}

export function resolveTupleTypeNode(
  { host, resolveNodeWithState, tupleElementIsRest }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const syntaxElements = host.ast.elements(node);
  const elements = syntaxElements.map((element, index) =>
    resolveNodeWithState(
      element,
      queries.sourceFile,
      nextState(csharpSourceStorageComponentContext(host, state, { kind: "tuple-element", index })),
    )
  );
  if (elements.some((element) => element === undefined)) {
    return undefined;
  }
  const restIndexes = syntaxElements.flatMap((element, index) =>
    tupleElementIsRest(element) ? [index] : []
  );
  return selectCsharpParameterListCarrier(elements as readonly TargetTypeRef[], restIndexes,
    selectedCsharpSourceProfileOwner(host.target) === "js");
}

export function tupleElementIsRest(
  { host }: CsharpTypeResolutionScope,
  element: Node | undefined,
): boolean {
  if (element === undefined) {
    return false;
  }
  if (host.ast.is.IsRestTypeNode(element)) {
    return true;
  }
  return host.ast.is.IsNamedTupleMember(element) &&
    host.ast.as.AsNamedTupleMember(element)?.DotDotDotToken !== undefined;
}
