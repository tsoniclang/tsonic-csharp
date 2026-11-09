import type { Node } from "@tsonic/tsts";
import type { SourceFieldMarker, SourceGenerator, SourcePresence, SourceTypeEvidence, SourceYield } from "@tsonic/target-api/source";
import type { SourceStorageBindings } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationPosition } from "../../target-model/types/representation.js";
import type { TargetTypeRef, CsharpTypeParameterConstraintResolution } from "../../target-model/types/native-type-data.js";
import type { CsharpContextualTypeEvidence, CsharpSourceArgumentClassification,
  CsharpSourceEvidenceIndex, CsharpValueRefinementClassification } from "../../target-model/records/program/source-evidence.js";
import type { CsharpSourceDefaultValue, CsharpSourceField, CsharpSourceStruct } from "../../target-model/records/program/source-markers.js";
import type { CsharpPointerReturnContract } from "../../target-model/records/calls/pointer-return.js";
import type { CsharpSourceEvidenceBuilder } from "./model.js";
import { createCsharpPointerBackingDemands } from "./pointer-backing.js";
import { resolveCsharpPointerReturnContract } from "../callables/ownership/pointer-return.js";
import { csharpNativePropertyNameIssue } from "../objects/computed-field-names.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";

interface CsharpNativeMarkers {
  readonly defaultValue: CsharpSourceDefaultValue | undefined;
  readonly field: CsharpSourceField | undefined;
  readonly struct: CsharpSourceStruct | undefined;
}

export function createCsharpSourceEvidenceBuilder(policy: CsharpPolicyContext): CsharpSourceEvidenceBuilder {
  const { facts, representation, sourceStorage } = policy;
  const values = new Map<Node, TargetTypeRef>();
  const storage = new Map<Node, TargetTypeRef>();
  const contexts = new Map<Node, CsharpContextualTypeEvidence>();
  const refinements = new Map<Node, CsharpValueRefinementClassification>();
  const constants = new Map<Node, { readonly value: bigint | string }>();
  const generators = new Map<Node, SourceGenerator>();
  const generatorTypes = new Map<Node, TargetTypeRef>();
  const yields = new Map<Node, SourceYield>();
  const yieldTypes = new Map<Node, TargetTypeRef>();
  const returns = new Map<Node, TargetTypeRef>();
  const pointerReturns = new Map<Node, CsharpPointerReturnContract>();
  const arguments_ = new Map<Node, CsharpSourceArgumentClassification>();
  const defaults = new Map<Node, CsharpSourceDefaultValue>();
  const fields = new Map<Node, CsharpSourceField>();
  const structs = new Map<Node, CsharpSourceStruct>();
  const constraints = new Map<Node, CsharpTypeParameterConstraintResolution>();
  const erased = new Set<Node>();
  const targetTypes = new Map<string, TargetTypeRef>();
  const metadataIssues: CsharpSourceEvidenceIndex["memoryMetadataIssues"][number][] = [];
  const expressionIssues = new Map<Node, {
    readonly diagnostic: NonNullable<ReturnType<typeof csharpNativePropertyNameIssue>>;
    readonly requiredBy: Set<Node>;
  }>();
  const backing = createCsharpPointerBackingDemands(policy);
  let open = true;

  function assertOpen(node?: Node): void {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native evidence production cannot continue after sealing.", node);
  }

  function retain(...carriers: readonly TargetTypeRef[]): void {
    const pending = [...carriers];
    const visited = new Set<TargetTypeRef>();
    const completed = new Map<string, TargetTypeRef>();
    while (pending.length !== 0) {
      const type = pending.pop()!;
      if (visited.has(type)) continue;
      visited.add(type);
      const key = targetTypeRefKey(type, "emission");
      if (targetTypes.has(key) || completed.has(key)) continue;
      completed.set(key, type);
      pending.push(...csharpTargetTypeComponents(type));
    }
    for (const [key, type] of completed) targetTypes.set(key, type);
  }

  function represent(evidence: SourceTypeEvidence, position: CsharpRepresentationPosition,
    site: Node): CsharpRepresentationOutcome<TargetTypeRef> {
    const selected = representation.represent(evidence, position, site);
    return selected.kind !== "represented" ? selected : represented(selected.value.carrier);
  }

  function field(original: SourceFieldMarker, site: Node): CsharpRepresentationOutcome<CsharpSourceField> {
    const type = represent(original.value, "storage", site);
    return type.kind !== "represented" ? type : represented(Object.freeze({ sourceName: original.name,
      typeNode: original.typeNode, evidence: original.value, carrier: type.value, readonly: original.readonly }));
  }

  function markers(node: Node, evidence: SourceTypeEvidence): CsharpRepresentationOutcome<CsharpNativeMarkers> {
    const declaration = sourceOutcome(facts.protocols.declarationMarkers(node));
    if (declaration.kind !== "represented") return declaration;
    let defaultValue: CsharpSourceDefaultValue | undefined;
    let fieldValue: CsharpSourceField | undefined;
    let struct: CsharpSourceStruct | undefined;
    if (declaration.value.defaultValue.kind === "present") {
      const selected = declaration.value.defaultValue.value;
      const type = represent(selected.value, "value", node);
      if (type.kind !== "represented") return type;
      defaultValue = Object.freeze({ typeNode: selected.typeNode, evidence: selected.value, carrier: type.value });
    }
    if (declaration.value.field.kind === "present") {
      const selected = field(declaration.value.field.value, node);
      if (selected.kind !== "represented") return selected;
      fieldValue = selected.value;
    }
    const selected = sourceOutcome(facts.protocols.typeMarkers(evidence));
    if (selected.kind !== "represented") return selected;
    if (selected.value.struct.kind === "present") {
      const result: CsharpSourceField[] = [];
      for (const original of selected.value.struct.value.fields) {
        const selectedField = field(original, node);
        if (selectedField.kind !== "represented") return selectedField;
        result.push(selectedField.value);
      }
      struct = Object.freeze({ valueType: selected.value.struct.value.valueType, fields: Object.freeze(result) });
    }
    return represented(Object.freeze({ defaultValue, field: fieldValue, struct }));
  }

  function markerCarriers(selected: CsharpNativeMarkers): readonly TargetTypeRef[] {
    return [...(selected.defaultValue === undefined ? [] : [selected.defaultValue.carrier]),
      ...(selected.field === undefined ? [] : [selected.field.carrier]),
      ...(selected.struct?.fields.map(field => field.carrier) ?? [])];
  }

  function publishMarkers(node: Node, selected: CsharpNativeMarkers): void {
    if (selected.defaultValue !== undefined) {
      defaults.set(node, selected.defaultValue);
    }
    if (selected.field !== undefined) {
      fields.set(node, selected.field);
    }
    if (selected.struct !== undefined) {
      structs.set(node, selected.struct);
    }
  }

  return Object.freeze({
    get nativeExpressionIssues() {
      return Object.freeze([...expressionIssues].map(([sourceNode, issue]) => Object.freeze({
        ...issue.diagnostic, sourceNode, requiredBy: Object.freeze([...issue.requiredBy]),
      })));
    },
    value(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef> {
      assertOpen(occurrence);
      const evidence = sourceOutcome(facts.values.type(occurrence));
      if (evidence.kind !== "represented") return evidence;
      const selected = policy.nativeValue(occurrence);
      if (selected.kind !== "represented") return selected;
      const place = sourceOutcome(facts.protocols.storage(occurrence));
      if (place.kind !== "represented") return place;
      const stored: SourcePresence<SourceTypeEvidence> = place.value.kind === "none" ? place.value
        : Object.freeze({ kind: "present", value: place.value.value.value });
      const context = sourceOutcome(facts.values.contextual(occurrence));
      if (context.kind !== "represented") return context;
      let contextual: CsharpContextualTypeEvidence | undefined;
      if (context.value.kind === "present") {
        const type = represent(context.value.value, "storage", occurrence);
        if (type.kind !== "represented") return type;
        contextual = Object.freeze({ evidence: context.value.value, targetType: type.value });
      }
      const marked = markers(occurrence, evidence.value);
      if (marked.kind !== "represented") return marked;
      const previous = values.get(occurrence);
      if (previous !== undefined && targetTypeRefKey(previous, "emission") !== targetTypeRefKey(selected.value, "emission")) failTargetAnalysisInvariant("tsonic-csharp",
        "One original Native value cannot publish different physical carriers in a representation iteration.", occurrence);
      retain(selected.value, ...(contextual === undefined ? [] : [contextual.targetType]), ...markerCarriers(marked.value));
      if (contextual !== undefined) {
        contexts.set(occurrence, contextual);
      }
      publishMarkers(occurrence, marked.value);
      values.set(occurrence, selected.value);
      refinements.set(occurrence, represented(Object.freeze({ occurrence,
        selected: Object.freeze({ evidence: evidence.value, carrier: selected.value }), storage: stored })));
      return selected;
    },
    declaration(node: Node): CsharpRepresentationOutcome<TargetTypeRef> {
      assertOpen(node);
      const declared = policy.types.declaredSlot(node);
      if (declared.kind !== "represented") return declared;
      const selected = markers(node, declared.value.source.type);
      if (selected.kind !== "represented") return selected;
      retain(declared.value.value.carrier, ...markerCarriers(selected.value));
      publishMarkers(node, selected.value);
      storage.set(node, declared.value.value.carrier);
      return represented(declared.value.value.carrier);
    },
    parameter(declaration: Node): CsharpRepresentationOutcome<void> {
      assertOpen(declaration);
      const original = sourceOutcome(facts.values.declaredSlot(declaration));
      if (original.kind !== "represented") return original;
      if (original.value.type.type.kind !== "parameter" || original.value.type.type.declaration !== declaration) {
        failTargetAnalysisInvariant("tsonic-csharp", "Native parameter enrollment requires the exact registered Source binder.", declaration);
      }
      const selected = representation.parameter(representation.source.typeParameter(declaration), declaration);
      if (selected.kind !== "represented") return selected;
      retain(selected.value);
      constraints.set(declaration, selected.value.csharpConstraints);
      return represented(undefined);
    },
    argument(occurrence: Node): CsharpRepresentationOutcome<void> {
      assertOpen(occurrence);
      const selected = sourceOutcome(facts.protocols.argumentPassing(occurrence));
      if (selected.kind !== "represented") return selected;
      if (selected.value.kind === "present" && selected.value.value.role === "argument") {
        arguments_.set(occurrence, Object.freeze({ kind: "resolved", argument: Object.freeze({
          passingMode: selected.value.value.mode, storageExpression: selected.value.value.storageExpression }) }));
      }
      return represented(undefined);
    },
    enumMember(declaration: Node): CsharpRepresentationOutcome<void> {
      assertOpen(declaration);
      const selected = sourceOutcome(facts.enums.member(declaration));
      if (selected.kind !== "represented") return selected;
      constants.set(declaration, Object.freeze({ value: selected.value.constant }));
      return represented(undefined);
    },
    generator(declaration: Node): CsharpRepresentationOutcome<void> {
      assertOpen(declaration);
      const selected = sourceOutcome(facts.protocols.generator(declaration));
      if (selected.kind !== "represented") return selected;
      if (selected.value.kind === "none") return represented(undefined);
      const type = represent(selected.value.value.result, "return", declaration);
      if (type.kind !== "represented") return type;
      retain(type.value);
      generators.set(declaration, selected.value.value);
      generatorTypes.set(declaration, type.value);
      return represented(undefined);
    },
    callableReturn(declaration, signature) {
      assertOpen(declaration);
      if (signature.declaration !== declaration) throw new TypeError("A Native return record requires its exact original callable declaration.");
      const selected = policy.types.callableReturn(signature, declaration);
      if (selected.kind !== "represented") return selected;
      retain(selected.value.carrier);
      returns.set(declaration, selected.value.carrier);
      return represented(selected.value.carrier);
    },
    yielded(occurrence: Node): CsharpRepresentationOutcome<void> {
      assertOpen(occurrence);
      const selected = sourceOutcome(facts.protocols.yield(occurrence));
      if (selected.kind !== "represented") return selected;
      if (selected.value.kind === "none") return represented(undefined);
      const type = represent(selected.value.value.resumed, "value", occurrence);
      if (type.kind !== "represented") return type;
      retain(type.value);
      yields.set(occurrence, selected.value.value);
      yieldTypes.set(occurrence, type.value);
      return represented(undefined);
    },
    returned(declaration: Node, bindings: SourceStorageBindings) {
      assertOpen(declaration);
      const selected = resolveCsharpPointerReturnContract(policy, declaration, bindings);
      if (selected.kind !== "represented") return selected;
      if (selected.value !== undefined) {
        retain(selected.value.type);
        pointerReturns.set(declaration, selected.value);
        returns.set(declaration, selected.value.type);
      }
      return represented(undefined);
    },
    propertyName(name: Node, requiredBy: Node): CsharpRepresentationOutcome<void> {
      assertOpen(name);
      const selected = sourceOutcome(facts.objects.propertyName(name));
      if (selected.kind !== "represented") return selected;
      const diagnostic = csharpNativePropertyNameIssue(name, selected.value);
      if (diagnostic !== undefined) {
        const previous = expressionIssues.get(name);
        if (previous === undefined) expressionIssues.set(name, { diagnostic, requiredBy: new Set([requiredBy]) });
        else previous.requiredBy.add(requiredBy);
      }
      return represented(undefined);
    },
    metadata(occurrence: Node, bindings: SourceStorageBindings) {
      assertOpen(occurrence);
      const selected = sourceStorage.memory.memoryMetadata.declaration(occurrence, bindings);
      if (selected.kind !== "resolved") return selected;
      if (selected.value.kind === "present") {
        erased.add(occurrence);
        for (const issue of selected.value.value.issues) metadataIssues.push(Object.freeze({ node: issue.node,
          code: "CSHARP_MEMORY_METADATA_RUNTIME_ESCAPE", message: issue.reason }));
        return Object.freeze({ kind: "resolved" as const, value: Object.freeze({ kind: "present" as const,
          value: selected.value.value.value }) });
      }
      const value = sourceStorage.memory.memoryMetadata.value(occurrence, bindings);
      if (value.kind === "resolved" && value.value.kind === "present") erased.add(occurrence);
      return value;
    },
    compileTimeExpression(occurrence) {
      assertOpen(occurrence);
      const selected = sourceStorage.memory.memoryMetadata.isCompileTimeExpression(occurrence);
      if (selected.kind === "resolved" && selected.value) erased.add(occurrence);
      return selected;
    },
    closedArray(occurrence: Node, bindings: SourceStorageBindings) {
      assertOpen(occurrence);
      return sourceStorage.memory.closedArrayStorage.resolve(occurrence, bindings);
    },
    pointerBacking(occurrence: Node) {
      assertOpen(occurrence);
      return backing.record(occurrence);
    },
    eraseCompileTimeDeclaration(declaration: Node): void {
      assertOpen(declaration);
      if (!storage.has(declaration)) failTargetAnalysisInvariant("tsonic-csharp",
        "Native declaration erasure requires its completed admitted storage record.", declaration);
      erased.add(declaration);
    },
    seal(): CsharpSourceEvidenceIndex {
      assertOpen();
      open = false;
      const pointerBacking = backing.seal();
      return Object.freeze({
        memoryMetadataIssues: Object.freeze([...metadataIssues, ...pointerBacking.issues.map(issue => Object.freeze({
          node: issue.node, code: "CSHARP_POINTER_BACKING_NOT_PROVEN", message: issue.reason }))]),
        pointerBackingUses: pointerBacking.uses,
        compileTimeMetadata: snapshotFlags(erased),
        targetTypes: Object.freeze([...targetTypes.values()]),
        nodeTargetType: snapshotQueries(values), storageTargetType: snapshotQueries(storage),
        contextualType: snapshotQueries(contexts), constantValue: snapshotQueries(constants),
        valueRefinement: snapshotQueries(refinements), generator: snapshotQueries(generators),
        generatorTargetType: snapshotQueries(generatorTypes), yield: snapshotQueries(yields),
        yieldTargetType: snapshotQueries(yieldTypes), inferredCallableReturnType: snapshotQueries(returns),
        pointerReturn: snapshotQueries(pointerReturns), sourceArgument: snapshotQueries(arguments_),
        sourceDefaultValue: snapshotQueries(defaults), sourceField: snapshotQueries(fields),
        sourceStruct: snapshotQueries(structs), typeParameterConstraints: snapshotQueries(constraints),
      });
    },
  } satisfies CsharpSourceEvidenceBuilder);
}

function snapshotQueries<Value>(entries: ReadonlyMap<Node, Value>) {
  const snapshot = new Map(entries);
  return Object.freeze({ get: (node: Node): Value | undefined => snapshot.get(node) });
}

function snapshotFlags(entries: ReadonlySet<Node>) {
  const snapshot = new Set(entries);
  return Object.freeze({ get: (node: Node): boolean => snapshot.has(node) });
}
