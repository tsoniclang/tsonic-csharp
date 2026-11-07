// Node-keyed representation: one SourceProgramFacts read, then the one mapping. A Host refusal is forwarded unchanged
// (R5). Occurrence extension facts that select a .NET carrier the Source type does not name (layout queries, raw
// addresses, keep-alive, JS string markers on a value) are applied here, from the occurrence only.
// This is the LOGICAL carrier. A read of a declaration whose native storage selection chose a physical carrier (struct
// value storage, closed array layout, closed callable input) reads that carrier instead; the one owner of that choice
// is analysis/source-evidence/physical-reads.ts, composed by CsharpTypeQueries.value (K-2664). It needs C# planning
// state (scoped storage, the shape registry), which this mapping must not read.
import type { Node } from "@tsonic/tsts";
import type { SourceEffectiveTypeOutcome, SourceTypeFlowRefusal } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../target-model/types/model.js";
import { csharpRuntimeRawPointerTargetType } from "../target-model/types/carriers/runtime-carriers.js";
import { csharpJsStringTargetType, csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../target-model/types/carriers/scalar-types.js";
import { csharpNullableReferenceTargetType } from "../target-model/types/carriers/nullable.js";
import { readCsharpSourceJsStringMarker } from "../source/extension/markers.js";
import { readCsharpSourceRawAddress } from "../source/extension/raw-addresses.js";
import { readCsharpSourceKeepAlive } from "../source/extension/reachability.js";
import { selectCsharpLayoutObservation } from "../policy/operations/pointers/layout-observations.js";
import { csharpRepresentationContext, type CsharpRepresentationContext, type CsharpValueRepresentation } from "./context.js";
import { representSourceType } from "./descriptors.js";

/** facts.values.type(node), represented. */
export function representValue(node: Node, context: CsharpRepresentationContext): CsharpValueRepresentation {
  const carrier = representOccurrenceCarrier(node, context);
  if (carrier !== undefined) return carrier;
  return representOutcome(context.facts.values.type(node), node, context);
}

/** facts.values.slot(slot).type, represented in storage position. */
export function representSlot(slot: Node, context: CsharpRepresentationContext): CsharpValueRepresentation {
  const outcome = context.facts.values.slot(slot);
  if (outcome.kind === "refused") return outcome;
  if (outcome.slot !== slot) failTargetAnalysisInvariant("tsonic-csharp", "A Host slot record must retain its exact slot.", slot);
  return representSourceType(outcome.type, csharpRepresentationContext(context, slot, "storage"));
}

/** facts.values.callableReturn(declaration), represented in return position. */
export function representCallableReturn(declaration: Node, context: CsharpRepresentationContext): CsharpValueRepresentation {
  return representOutcome(context.facts.values.callableReturn(declaration), declaration,
    csharpRepresentationContext(context, declaration, "return"));
}

/** facts.values.awaited(node), represented. */
export function representAwaited(node: Node, context: CsharpRepresentationContext): CsharpValueRepresentation {
  return representOutcome(context.facts.values.awaited(node), node, context);
}

function representOutcome(outcome: SourceEffectiveTypeOutcome, node: Node,
  context: CsharpRepresentationContext): TargetTypeRef | SourceTypeFlowRefusal | ReturnType<typeof representSourceType> {
  if (outcome.kind === "refused") return outcome;
  if (outcome.provenance.occurrence !== node) failTargetAnalysisInvariant("tsonic-csharp",
    "A Host value type must retain its exact value occurrence.", node);
  return representSourceType(outcome.type, context.occurrence === node ? context : csharpRepresentationContext(context, node, context.position));
}

function representOccurrenceCarrier(node: Node, context: CsharpRepresentationContext): TargetTypeRef | undefined {
  const facts = context.sourceFacts;
  if (facts === undefined) return undefined;
  if (selectCsharpLayoutObservation(context.facts, node)?.kind === "layout-query") return csharpSourcePrimitiveTargetType("native-uint");
  const rawAddress = readCsharpSourceRawAddress(context.facts, node);
  if (rawAddress?.kind === "resolved") {
    // The address integer width is the operation's own data layout ABI in the Host record (the same field source-core
    // types the result uint32 / uint64 from), not the platform's native integer width: an explicit 32-bit address ABI
    // is valid in a 64-bit build (E24 keeps data layouts and the platform premise separate).
    return rawAddress.operation === "raw-to-address-integer"
      ? csharpSourcePrimitiveTargetType(rawAddress.addressWidth === 32 ? "uint32" : "uint64")
      : csharpNullableReferenceTargetType(csharpRuntimeRawPointerTargetType());
  }
  if (readCsharpSourceKeepAlive(context.facts, node) !== undefined) return csharpVoidTargetType();
  if (readCsharpSourceJsStringMarker(facts, node)) return csharpJsStringTargetType();
  return undefined;
}
