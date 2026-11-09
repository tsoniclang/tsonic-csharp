import type { CsharpPointerReturnContract } from "../../../target-model/records/calls/pointer-return.js";
import type { Node } from "@tsonic/tsts";
import type { SourceStorageBindings, SourceStorageUnresolved } from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpRuntimeLocationTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { resolveCsharpPointerStoragePointee } from "../../storage/pointer-pointee.js";
import { selectCsharpMemoryRuntimeDefinition } from "../../operations/pointers/runtime-definitions.js";
import { represented, sourceOutcome } from "../../../policy/types/source-type-flow/representation-results.js";

export type CsharpPointerReturnSelection = CsharpRepresentationOutcome<CsharpPointerReturnContract | undefined>
  | Extract<SourceStorageUnresolved, { readonly kind: "unresolved" }>;

export function resolveCsharpPointerReturnContract(
  host: Pick<CsharpPolicyContext, "ast" | "facts" | "representation" | "sourceStorage" | "providers">,
  declaration: Node,
  bindings: SourceStorageBindings,
): CsharpPointerReturnSelection {
  if (host.ast.body(declaration) === undefined || host.ast.hasModifierKind(declaration, "async")) return represented(undefined);
  const generator = sourceOutcome(host.facts.protocols.generator(declaration));
  if (generator.kind !== "represented") return generator;
  if (generator.value.kind === "present") return represented(undefined);
  const completion = sourceOutcome(host.facts.protocols.callableCompletion(declaration));
  if (completion.kind !== "represented") return completion;
  if (completion.value.kind === "none") return represented(undefined);
  const selection = host.sourceStorage.memory.pointerBacking.returned(declaration, bindings);
  if (selection.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: selection });
  if (selection.kind === "unresolved") return selection;
  const evidence = selection.value;
  const pointees: TargetTypeRef[] = [];
  for (const producer of evidence.producers) {
    const selected = resolveCsharpPointerStoragePointee(host, producer.storage);
    if (selected.kind !== "represented") return selected;
    if (selected.value.kind === "unresolved") return represented(undefined);
    pointees.push(selected.value.type);
  }
  if (evidence.kind === "open") {
    for (const boundary of evidence.boundaries) {
      const selected = resolveCsharpPointerStoragePointee(host, boundary);
      if (selected.kind !== "represented") return selected;
      if (selected.value.kind === "unresolved") return represented(undefined);
      pointees.push(selected.value.type);
    }
  }
  const first = pointees[0];
  if (first === undefined || pointees.some(type => !targetTypeRefEquals(host.providers.typeIdentity, type, first))) return represented(undefined);
  const definition = selectCsharpMemoryRuntimeDefinition(host, "Location", declaration);
  if (definition.kind !== "represented") return definition;
  const location = csharpRuntimeLocationTargetType(first, definition.value);
  return represented(Object.freeze({
    type: evidence.includesAbsence ? csharpNullableTargetType(location) : location,
    undefinedReturn: evidence.includesAbsence,
    fallthroughUndefined: evidence.includesAbsence && completion.value.value.canFallThrough,
  }));
}
