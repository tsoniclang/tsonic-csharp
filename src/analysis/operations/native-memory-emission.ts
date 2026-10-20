import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpRuntimeNativeLayoutTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { createCsharpNativeLayoutProducer } from "../program/records/native-layout-emission.js";

export function analyzeCsharpNativeMemoryEmission(input: { readonly nodes: readonly Node[];
  readonly storage: CsharpStorageClassifications; readonly operations: Pick<CsharpTargetOperationClassifications, "nativePointer"> }) {
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
  const visit = (layout: CsharpNativeMemoryLayout): boolean => {
    const previous = visited.get(layout);
    if (previous !== undefined) return previous;
    if (active.has(layout)) failTargetAnalysisInvariant("tsonic-csharp", "A closed native layout requires finite nonrecursive physical storage.");
    active.add(layout);
    const owner = csharpRuntimeNativeLayoutTargetType(layout.pointeeType);
    carriers.push(owner, layout.pointeeType);
    let array: { readonly element: TargetTypeRef; readonly length: number } | undefined;
    let hasWrites = true;
    if (layout.kind === "array") {
      if (layout.pointeeType.kind !== "array" || !/^(0|[1-9][0-9]*)$/u.test(layout.length) || BigInt(layout.length) > 2147483647n)
        failTargetAnalysisInvariant("tsonic-csharp", "An admitted array layout requires its exact native element and representable extent.");
      array = Object.freeze({ element: layout.pointeeType.element, length: Number(layout.length) });
      visit(layout.element);
    } else if (layout.kind === "record") {
      hasWrites = false;
      for (const field of layout.fields) hasWrites = visit(field.layout) || hasWrites;
    }
    producer.publish(layout, { owner, fields: Object.freeze(layout.kind === "array" ? [] : layout.fields.map(field => field.name)), array, hasWrites });
    visited.set(layout, hasWrites); active.delete(layout);
    return hasWrites;
  };
  for (const layout of pending) visit(layout);
  return Object.freeze({ records: producer.seal(), carriers: Object.freeze(carriers) });
}
