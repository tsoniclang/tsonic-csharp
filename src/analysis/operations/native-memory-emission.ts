import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpNativeLayoutRecords } from "../../target-model/records/native/native-layout-emission.js";
import { csharpRuntimeNativeArrayTargetType, csharpRuntimeNativeLayoutTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { createCsharpNativeLayoutProducer } from "../program/records/native/native-layout-emission.js";
import { selectCsharpMemoryRuntimeDefinition } from "./pointers/runtime-definitions.js";
import { represented } from "../../policy/types/source-type-flow/representation-results.js";
import { createCsharpMetadataBudget } from "../../target-model/metadata/immutable.js";

export function analyzeCsharpNativeMemoryEmission(input: { readonly nodes: readonly Node[]; readonly policy: CsharpPolicyContext;
  readonly site: Node; readonly storage: CsharpStorageClassifications;
  readonly operations: Pick<CsharpTargetOperationClassifications, "nativePointer"> }):
  CsharpRepresentationOutcome<{ readonly records: CsharpNativeLayoutRecords; readonly carriers: readonly TargetTypeRef[] }> {
  const producer = createCsharpNativeLayoutProducer();
  const pending = [...input.storage.nativeBackings.map(backing => backing.layout), ...input.storage.nativeArrays.map(array => array.storage.layout),
    ...input.storage.nativeFields.map(field => field.layout)];
  for (const node of input.nodes) {
    const operation = input.operations.nativePointer.get(node);
    if (operation?.kind === "raw-location") pending.push(operation.layout);
  }
  const visited = new Map<CsharpNativeMemoryLayout, boolean>();
  const active = new Set<CsharpNativeMemoryLayout>();
  const carriers: TargetTypeRef[] = [];
  const budget = createCsharpMetadataBudget();
  const arrayLayouts = new Set(input.storage.nativeArrays.map(array => array.storage.layout));
  const visit = (layout: CsharpNativeMemoryLayout, depth: number): CsharpRepresentationOutcome<boolean> => {
    budget.reserve(1, depth);
    const previous = visited.get(layout);
    if (previous !== undefined) return represented(previous);
    if (active.has(layout)) failTargetAnalysisInvariant("tsonic-csharp", "A closed native layout requires finite nonrecursive physical storage.");
    active.add(layout);
    const definition = selectCsharpMemoryRuntimeDefinition(input.policy, "NativeLayout", input.site);
    if (definition.kind !== "represented") return definition;
    const memory = selectCsharpMemoryRuntimeDefinition(input.policy, "NativeLocation", input.site);
    if (memory.kind !== "represented") return memory;
    const owner = csharpRuntimeNativeLayoutTargetType(layout.pointeeType, definition.value);
    const memoryOwner = memory.value.carrier;
    let scalarFactory: TargetTypeRef | undefined;
    let arrayStorage: TargetTypeRef | undefined;
    if (layout.kind === "scalar") {
      const selected = selectCsharpMemoryRuntimeDefinition(input.policy, "NativeLayoutFactory", input.site);
      if (selected.kind !== "represented") return selected;
      scalarFactory = selected.value.carrier;
      carriers.push(scalarFactory);
    }
    if (arrayLayouts.has(layout)) {
      const selected = selectCsharpMemoryRuntimeDefinition(input.policy, "NativeArray", input.site);
      if (selected.kind !== "represented") return selected;
      arrayStorage = csharpRuntimeNativeArrayTargetType(layout.pointeeType, selected.value);
      carriers.push(arrayStorage);
    }
    carriers.push(owner, memoryOwner, layout.pointeeType);
    let array: { readonly element: TargetTypeRef; readonly length: number } | undefined;
    let hasWrites = true;
    if (layout.kind === "array") {
      if (layout.pointeeType.kind !== "array" || !/^(0|[1-9][0-9]*)$/u.test(layout.length) || BigInt(layout.length) > 2147483647n)
        failTargetAnalysisInvariant("tsonic-csharp", "An admitted array layout requires its exact native element and representable extent.");
      array = Object.freeze({ element: layout.pointeeType.element, length: Number(layout.length) });
      const selected = visit(layout.element, depth + 1);
      if (selected.kind !== "represented") return selected;
    } else if (layout.kind === "record") {
      hasWrites = false;
      for (const field of layout.fields) {
        const selected = visit(field.layout, depth + 1);
        if (selected.kind !== "represented") return selected;
        hasWrites = selected.value || hasWrites;
      }
    }
    producer.publish(layout, { owner, memoryOwner, scalarFactory, arrayStorage,
      fields: Object.freeze(layout.kind === "array" ? [] : layout.fields.map(field => field.name)), array, hasWrites });
    visited.set(layout, hasWrites); active.delete(layout);
    return represented(hasWrites);
  };
  for (const layout of pending) {
    const selected = visit(layout, 0);
    if (selected.kind !== "represented") return selected;
  }
  return represented(Object.freeze({ records: producer.seal(), carriers: Object.freeze(carriers) }));
}
