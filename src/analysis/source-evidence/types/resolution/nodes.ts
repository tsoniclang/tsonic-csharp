import type { CsharpTypeResolutionScope } from "./scope.js";
import { resolveCsharpConstructorValueType } from "./constructors.js";
import type { CsharpTypePolicyHost, CsharpTypeResolutionState } from "./model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { maximumTypeResolutionDepth } from "./model.js";
import { failTargetAnalysisInvariant, failTargetCompilerResourceLimit } from "@tsonic/target-api/artifacts";
import { resolveCsharpSourceLiteralTargetType } from "../../../../policy/conversions/source-literals.js";
import { resolveKeywordType } from "../../../../policy/types/resolution/source-primitives.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";

import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import { assertCsharpProviderIndexedAccessSource, resolveFormedCsharpProviderIndexedAccess } from "./indexed-access.js";
import { assertCsharpArrayTypeNodeSource, formCsharpNodeTypeSource,
  type CsharpArrayTypeNodeSource, type CsharpNodeTypeSource } from "./root-sources.js";
import { resolveFormedCsharpProjectReference } from "./project-types.js";

import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import { resolveFormedCsharpContextualParameterCarrier } from "./contextual-parameter-source.js";
import { resolveFormedCsharpNativeParameterCarrier } from "./native-parameter-source.js";
import { resolveFormedCsharpProjectInstanceTargetType } from "./project-instance-source.js";
import { resolveFormedCsharpCallableType } from "./source-profiles.js";
import { assertCsharpTupleTypeNodeSource,
  type CsharpTupleTypeNodeSource } from "./tuple-node-source.js";
import { assertCsharpNodeSyntaxChildSource, assertCsharpNodeTypeSyntaxSource,
  type CsharpNodeSyntaxChildSource } from "./node-syntax-source.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
import { assertCsharpUnionTypeNodeSource, type CsharpUnionTypeNodeSource } from "./union-node-source.js";
import { assertCsharpNodeBranchSource, type CsharpNodeBranchSource } from "./node-branch-source.js";
export function resolveNodeValueWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  return resolveFormedCsharpNodeTypeSource(scope, formCsharpNodeTypeSource(scope, node, sourceFile, state));
}

export function resolveFormedCsharpNodeTypeSource(
  scope: CsharpTypeResolutionScope,
  source: CsharpNodeTypeSource,
): CsharpSourceCallResult | undefined {
  if (source.kind === "node" && source.declaredReceiver !== undefined) {
    const receiver = source.declaredReceiver;
    if (receiver.node !== source.node || receiver.queries !== source.queries || receiver.state !== source.state ||
      receiver.context !== scope.host.declaredObjectReceivers.get(source.node)) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared receiver requires its exact Source occurrence, lexical context and bound state.", source.node);
    }
    const selected = receiver.source;
    if (selected !== undefined && (selected.node !== source.node || selected.queries !== source.queries ||
      selected.state !== source.state || selected.context !== receiver.context || selected.type !== source.selectedType ||
      selected.kind === "type" && (selected.declarations.length !== selected.members.length ||
        selected.declarations.some((member, index) => member !== undefined &&
          (member.property !== selected.members[index] || member.queries !== selected.queries))))) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared receiver view requires the exact selected Source type and ordered declaration rows.", source.node);
    }
  }
  if (source.kind === "node" && (source.nativeParameter === undefined || source.nativeParameter.parameter !== source.node)) return failTargetAnalysisInvariant("tsonic-csharp",
    "A native parameter projection requires its exact retained Source node.", source.node);
  if (source.kind === "node" && (source.projectInstance === undefined || source.projectInstance.node !== source.node)) return failTargetAnalysisInvariant("tsonic-csharp",
    "A project instance requires its exact retained Source node.", source.node);
  if (source.kind === "node" && (source.contextualParameter === undefined ||
      source.contextualParameter.declaration !== source.node || source.contextualParameter.queries !== source.queries)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A contextual parameter requires its exact retained Source occurrence.", source.node);
  }
  if (source.kind === "node" && (source.functionType === undefined || source.functionType.node !== source.node ||
      source.functionType.kind !== "not-function" && source.functionType.kind !== "function" ||
      source.functionType.queries !== source.queries || source.functionType.state !== source.state ||
      source.functionType.kind === "function" && (source.functionType.type === undefined
        ? source.functionType.callable !== undefined
        : source.functionType.callable === undefined || source.functionType.callable.source.type !== source.functionType.type ||
          source.functionType.callable.source.queries !== source.queries || source.functionType.callable.state !== source.state))) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A function-type node requires its exact authored callable Source and original state.", source.node);
  }
  if (source.kind === "node" && (source.arrayType === undefined || source.arrayType.node !== source.node ||
      source.arrayType.queries !== source.queries || source.arrayType.state !== source.state)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "An array-type node requires its exact element, fallback and captured storage Source.", source.node);
  }
  if (source.kind === "node") assertCsharpArrayTypeNodeSource(source.arrayType);
  if (source.kind === "node" && (source.tupleType === undefined || source.tupleType.node !== source.node ||
      source.tupleType.queries !== source.queries || source.tupleType.state !== source.state)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A tuple-type node requires its exact ordered syntax and bound Source children.", source.node);
  }
  if (source.kind === "node") assertCsharpTupleTypeNodeSource(source.tupleType);
  if (source.kind === "node" && (source.unionType === undefined || source.unionType.node !== source.node ||
      source.unionType.queries !== source.queries || source.unionType.state !== source.state ||
      source.unionType.kind !== "not-union" && (source.cycle === undefined || source.unionType.type !== source.cycle.type))) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A union-type node requires its exact retained Source children.", source.node);
  }
  if (source.kind === "node") assertCsharpUnionTypeNodeSource(source.unionType);
  if (source.kind === "node" && (source.syntax === undefined || source.syntax.node !== source.node ||
      source.syntax.queries !== source.queries || source.syntax.state !== source.state)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A node requires its exact annotation and nested-type Source selections.", source.node);
  }
  if (source.kind === "node") assertCsharpNodeTypeSyntaxSource(source.syntax);
  if (source.kind === "node" && (source.branches === undefined || source.branches.node !== source.node ||
      source.branches.queries !== source.queries || source.branches.state !== source.state)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A node branch requires its exact retained syntax and value Source.", source.node);
  }
  if (source.kind === "node") assertCsharpNodeBranchSource(source.branches);
  if (source.kind === "node" && (source.indexed === undefined || source.indexed.node !== source.node ||
      source.indexed.queries !== source.queries || source.indexed.state !== source.state)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Provider indexed completion requires its exact retained Source rows.", source.node);
  }
  if (source.kind === "node") assertCsharpProviderIndexedAccessSource(source.indexed);
  if (source.kind === "node" && (source.value === undefined || (source.selectedType === undefined ? source.selectedValue !== undefined
    : source.selectedValue === undefined || source.selectedValue.node !== source.node ||
      source.selectedValue.queries !== source.queries || source.selectedValue.selectedType !== source.selectedType ||
      source.selectedValue.inputState !== source.state || source.selectedValue.selection !== source.value.selection))) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A selected node value requires its exact retained Source occurrence and declaration selection.", source.node);
  }
  const selected = resolveNodeResultWithState(scope, source);
  return source.kind === "unavailable" ? selected : refineCsharpSourceValueResult(selected,
    resolveFormedCsharpNativeParameterCarrier(scope, source.nativeParameter, selected?.selectedType, source.originalState));
}

function resolveNodeResultWithState(
  scope: CsharpTypeResolutionScope,
  source: CsharpNodeTypeSource,
): CsharpSourceCallResult | undefined {
  const { host, resolveFormedDirectSourceFacts, resolveFormedSelectedExpressionResult, resolveFormedSourceValueResult, resolveFormedTypeReferenceNode } = scope;
  if (source.node === undefined) return undefined;
  if (source.state.depth > maximumTypeResolutionDepth) failTargetCompilerResourceLimit("tsonic-csharp",
    "Selected native source-node type resolution", "depth", maximumTypeResolutionDepth, source.node);
  if (source.kind === "unavailable") return undefined;
  const { node, queries, state } = source;
  const scopedTargetType = host.representations.scopedTargetType(node);
  if (scopedTargetType !== undefined) {
    const selected = source.selectedType;
    return selected === undefined ? csharpSourceValueResult(scopedTargetType)
      : scope.resolveFormedSelectedValueResult(source.selectedValue!);
  }
  const syntaxFact = resolveFormedCsharpProviderIndexedAccess(scope, source.indexed) ?? resolveFormedDirectSourceFacts(source.directSyntax);
  if (syntaxFact !== undefined) {
    return csharpSourceValueResult(syntaxFact);
  }
  if (source.branches.arrayLiteral) {
    const selection = scope.resolveArrayLiteralWithState(node, queries, state);
    if (selection.kind === "rejected") state.rejectNativeResolution?.(Object.freeze({ kind: "rejected", subject: node,
      code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH", reason: selection.reason }));
    return selection.kind === "resolved" ? csharpSourceValueResult(selection.carrier) : undefined;
  }
  if (source.syntax.annotation !== undefined) return resolveFormedCsharpNodeSyntaxChild(scope, source.syntax.annotation);
  const contextualParameter = resolveFormedCsharpContextualParameterCarrier(scope, source.contextualParameter, state);
  if (contextualParameter.kind !== "not-applicable") return contextualParameter.kind === "resolved"
    ? csharpSourceValueResult(contextualParameter.type) : undefined;
  const selectedExpression = resolveFormedSelectedExpressionResult(source.selectedExpression);
  if (selectedExpression !== undefined) {
    return selectedExpression;
  }
  const direct = resolveFormedDirectSourceFacts(source.directValue);
  if (direct !== undefined) {
    return csharpSourceValueResult(direct);
  }
  const scalar = resolveFormedCsharpNodeLiteralSource(host, source.branches);
  if (scalar !== undefined) {
    return scalar;
  }
  if (source.functionType.kind === "function") {
    const callable = source.functionType.callable;
    return callable === undefined ? undefined : csharpSourceValueResult(resolveFormedCsharpCallableType(scope, callable));
  }
  if (source.arrayType.kind === "array") {
    return csharpSourceValueResult(resolveFormedCsharpArrayTypeNode(scope, source.arrayType));
  }
  if (source.tupleType.kind === "tuple") {
    return csharpSourceValueResult(resolveFormedCsharpTupleTypeNode(scope, source.tupleType));
  }
  if (source.unionType.kind !== "not-union") return resolveFormedCsharpUnionTypeNode(scope, source.unionType);
  if (source.syntax.nested !== undefined) return resolveFormedCsharpNodeSyntaxChild(scope, source.syntax.nested);
  const typeQuery = resolveFormedCsharpTypeQueryNodeSource(host, source.branches);
  if (typeQuery.kind === "struct") return typeQuery.result;
  if (source.reference !== undefined) {
    const resolved = resolveFormedTypeReferenceNode(source.reference);
    if (resolved !== undefined) {
      return csharpSourceValueResult(resolved);
    }
  }
  const projectThis = resolveFormedCsharpProjectInstanceTargetType(scope, source.projectInstance);
  if (projectThis !== undefined) {
    return csharpSourceValueResult(projectThis);
  }
  const selectedType = source.branches.identifier ? source.selectedType : undefined;
  const value = source.value;
  if (value === undefined || value.node !== node || value.queries !== queries || value.state !== state || value.selectedType !== undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A node value requires its exact retained declaration Source.", node);
  }
  const declaredValue = selectedType !== undefined && value.selection.declaration !== undefined
    ? scope.resolveFormedSelectedValueResult(source.selectedValue!)
    : resolveFormedSourceValueResult(value);
  if (declaredValue !== undefined) {
    return declaredValue;
  }
  return csharpSourceValueResult(resolveFallbackNodeCarrier(scope, source));
}

export function resolveFormedCsharpArrayTypeNode(
  scope: Pick<CsharpTypeResolutionScope,
    "host" | "resolveNodeWithState" | "resolveTypeWithState">,
  source: CsharpArrayTypeNodeSource,
): TargetTypeRef | undefined {
  assertCsharpArrayTypeNodeSource(source);
  if (source.kind === "not-array") return undefined;
  const { host, resolveNodeWithState, resolveTypeWithState } = scope;
  const element = resolveNodeWithState(source.element.node, source.element.sourceFile, source.element.state);
  return element === undefined
    ? resolveTypeWithState(source.fallback.type, source.fallback.sourceFile, source.fallback.state)
    : selectedCsharpSourceProfileOwner(host.target) === "js" ? csharpJsArrayTargetType(element)
      : { kind: "array", element };
}

export function resolveFormedCsharpNodeSyntaxChild(
  scope: Pick<CsharpTypeResolutionScope, "resolveNodeWithState" | "resolveNodeValueWithState">,
  source: CsharpNodeSyntaxChildSource,
): CsharpSourceCallResult | undefined {
  assertCsharpNodeSyntaxChildSource(source);
  const { child } = source;
  if (source.kind === "annotation" || source.kind === "optional") {
    const type = scope.resolveNodeWithState(child.node, child.sourceFile, child.state);
    return csharpSourceValueResult(type === undefined || source.kind === "annotation" && !source.nullable
      ? type : csharpNullableTargetType(type));
  }
  return scope.resolveNodeValueWithState(child.node, child.sourceFile, child.state);
}

export function resolveFormedCsharpUnionTypeNode(
  scope: Pick<CsharpTypeResolutionScope,
    "host" | "resolveNodeWithState" | "resolveTypeWithState" | "sourceUnionDefinitions" | "sourceUnions">,
  source: CsharpUnionTypeNodeSource,
): CsharpSourceCallResult | undefined {
  assertCsharpUnionTypeNodeSource(source);
  if (source.kind === "not-union") return undefined;
  if (source.kind === "selected") {
    return csharpSourceValueResult(scope.resolveTypeWithState(source.child.type, source.child.sourceFile, source.child.state));
  }
  const { type, queries, state } = source;
  const structural = type === undefined ? { kind: "not-applicable" as const }
    : scope.host.structuralTypes.resolveUnion(type, queries.sourceFile, state);
  if (structural.kind !== "not-applicable") return structural.kind === "resolved" ? csharpSourceValueResult(structural.type) : undefined;
  if (type === undefined || source.checkedMembers.some(member => member === undefined)) return undefined;
  let members: readonly (TargetTypeRef | undefined)[] = [];
  const carrier = scope.sourceUnionDefinitions.resolve(type, queries, state, () => {
    members = source.members.map(member => scope.resolveNodeWithState(member.node, member.sourceFile, member.state));
    if (members.some(member => member === undefined)) return { carrier: undefined, arms: [] };
    const arms = members as readonly TargetTypeRef[];
    return { carrier: retainCsharpUnionObjectShapes(combineCsharpTargetUnionMembers(arms), scope.host.structuralTypes.resolveTarget), arms };
  });
  return csharpSourceValueResult(scope.sourceUnions.retain(carrier,
    members.map((member, index) => ({ source: source.checkedMembers[index]!, carrier: member! })), queries, state));
}

export function resolveFormedCsharpNodeLiteralSource(
  host: Pick<CsharpTypePolicyHost, "target">,
  source: CsharpNodeBranchSource,
): CsharpSourceCallResult | undefined {
  assertCsharpNodeBranchSource(source);
  return csharpSourceValueResult(resolveCsharpSourceLiteralTargetType(host, source.literal) ?? resolveKeywordType(source.nodeKind));
}

export function resolveFormedCsharpTypeQueryNodeSource(
  host: Pick<CsharpTypePolicyHost, "projectTypeCatalog">,
  source: CsharpNodeBranchSource,
): { readonly kind: "not-applicable" } | {
  readonly kind: "struct";
  readonly source: CsharpNodeBranchSource;
  readonly result: CsharpSourceCallResult | undefined;
} {
  assertCsharpNodeBranchSource(source);
  if (source.typeQuery === undefined) return Object.freeze({ kind: "not-applicable" });
  const definition = host.projectTypeCatalog.definitionForDeclaration(source.typeQuery.declaration);
  return definition?.kind !== "struct" ? Object.freeze({ kind: "not-applicable" })
    : Object.freeze({ kind: "struct", source,
        result: csharpSourceValueResult(host.projectTypeCatalog.targetTypeForDeclaration(definition.declaration, [])) });
}

function resolveFallbackNodeCarrier(
  scope: CsharpTypeResolutionScope,
  source: Extract<CsharpNodeTypeSource, { readonly kind: "node" }>,
): TargetTypeRef | undefined {
  const { host } = scope;
  const { queries, state } = source;
  if (!source.branches.classOrInterface) {
    const constructor = resolveCsharpConstructorValueType(scope, source.selectedType, queries, state);
    if (constructor !== undefined) return constructor;
  }
  const projectType = source.project === undefined ? undefined : resolveFormedCsharpProjectReference(scope, source.project);
  if (projectType !== undefined) {
    return projectType;
  }
  const structuralType = host.structuralTypes.completeNodeSource(source.structural);
  if (structuralType !== undefined) {
    return structuralType;
  }
  return scope.resolveFormedSemanticTypeSource(source.semantic);
}

export function resolveFormedCsharpTupleTypeNode(
  scope: Pick<CsharpTypeResolutionScope, "host" | "resolveNodeWithState">,
  source: CsharpTupleTypeNodeSource,
): TargetTypeRef | undefined {
  assertCsharpTupleTypeNodeSource(source);
  if (source.kind === "not-tuple") return undefined;
  const elements = source.elements.map(element => scope.resolveNodeWithState(element.node, element.sourceFile, element.state));
  if (elements.some(element => element === undefined)) return undefined;
  return selectCsharpParameterListCarrier(elements as readonly TargetTypeRef[], source.restIndexes,
    selectedCsharpSourceProfileOwner(scope.host.target) === "js");
}
