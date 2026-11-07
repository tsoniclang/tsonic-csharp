import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorsEqual, type SourceProgramFacts, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { isCsharpRefusal, type CsharpRepresentation } from "../../representation/index.js";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpNumberErasureCandidate } from "../../target-model/conversions/number-erasure.js";

export { csharpNumberErasureCandidate, csharpNumberErasureSupersedes } from "../../target-model/conversions/number-erasure.js";

// N3′ / WP0 A3 (C-2499, K-2621, K-2671): a Q1 int64 value of number origin that the Host admits into a broad slot
// (unknown/object) with `exact-number-erasure` is converted exactly to float64 at that use and boxed as a number. The
// Host alone proved exactness (literal/integer-constant metadata) and owns the refusal of inexact and nonconstant
// values; C# never re-derives width, range or exactness. The admission is per use: a native pair (int64 → TsValue)
// classified at one use never decides another use.

export interface CsharpNumberErasure {
  readonly use: Node;
  /** The int64 carrier of the value at the use (the original producer and read are unchanged). */
  readonly input: TargetTypeRef;
  /** The carrier of the Host erasure result (float64). */
  readonly result: TargetTypeRef;
  /** The Host's original numeric origin (the literal or integer-constant producer that proved exactness). */
  readonly origin: Node;
}

export interface CsharpNumberErasureHost {
  readonly facts: SourceProgramFacts;
  /** The one descriptor → carrier mapping (representation/), at the use. */
  readonly represent: (descriptor: SourceTypeDescriptor, occurrence: Node) => CsharpRepresentation;
}

/**
 * The Host slot admission of this exact use, authenticated, when the conversion is an erasure candidate. Returns the
 * erasure for `exact-number-erasure`, undefined for `identity` (an explicitly authored int64/bigint, or `any`, keeps
 * its box) and for a use outside the Host destination domain.
 *
 * The domain is the Host's (K-2678, K-2683): `values.destination(use)` names the Host slot every value use flows into,
 * with its broadness. Only a BROAD destination is inside the A3 admission domain. A use with no Host destination (an
 * operation operand, a target-internal box) or with a non-broad destination (`identity(original)` into `T`, a
 * `string` slot) has no admission, so none is read and nothing is erased. Inside the domain the Host owns the evidence:
 * a refused destination, a missing admission (the Host throws), a refused admission, an admission of another slot, a
 * destination the C# mapping cannot represent, or foreign or conflicting evidence is an invariant failure (I4, R5). It
 * is never a reason to keep the long box. Broadness is the Host's `destination.broad`, never a resemblance of C#
 * carriers.
 */
export function readCsharpNumberErasure(host: CsharpNumberErasureHost, use: Node, source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined, mode: CsharpConversionMode): CsharpNumberErasure | undefined {
  // R3 #24: an optional int64 carrier (`long?`) into a broad slot is inside the same Host domain; the Host decides,
  // and an erasure there has no C# realization (invariant below), never a silent long box.
  const optionalInput = source === undefined ? undefined : getCsharpNullableElementTargetType(source);
  const input = optionalInput !== undefined && csharpNumberErasureCandidate(optionalInput, target, mode) ? optionalInput : source;
  if (!csharpNumberErasureCandidate(input, target, mode)) return undefined;
  const { facts } = host;
  const destination = facts.values.destination(use);
  // Outside the A3 domain: no Host slot, or a slot that is not broad. No admission exists there and none is read.
  if (destination === undefined) return undefined;
  if (destination.kind === "refused") return conflict(use,
    "A refused Host destination reached C# analysis; Host refusals are forwarded before any C# analysis.");
  if (!destination.broad) return undefined;
  // Inside the domain. Throws (Host invariant) when the Host published no admission at this use.
  const admission = facts.values.admission(use);
  if (admission.use !== use) return conflict(use, "The Host slot admission belongs to another occurrence.");
  if (admission.kind === "refused") return conflict(use,
    "A refused Host slot admission reached C# analysis; Host refusals are forwarded before any C# analysis.");
  if (admission.slot !== destination.slot || destination.type !== admission.destination) return conflict(use,
    "The Host destination and the slot admission of one use must name the same broad slot and published descriptor.");
  if (!Object.isFrozen(admission) || !Object.isFrozen(admission.destination) || !Object.isFrozen(admission.conversion)) return conflict(use,
    "The Host slot admission must be a frozen publication.");
  // The one descriptor → carrier mapping of the Host destination must be the broad carrier this conversion boxes into.
  // A failed mapping is no evidence that the A3 obligation is absent.
  const carrier = host.represent(destination.type, use);
  if (isCsharpRefusal(carrier)) return conflict(use,
    "The Host broad destination of an int64 use has no C# representation; a failed mapping does not waive its admission.");
  if (!csharpNumberErasureCandidate(input, carrier, mode)) return conflict(use,
    "The C# carrier of the Host broad destination disagrees with the broad carrier this int64 use converts into.");
  const value = facts.values.type(use);
  if (value.kind === "refused" || !sourceTypeDescriptorsEqual(value.type, admission.value)) return conflict(use,
    "The Host slot admission requires the published value of the same occurrence.");
  const conversion = admission.conversion;
  if (conversion.kind === "identity") return undefined;
  if (admission.value.kind !== "primitive" || admission.value.primitive !== "int64" ||
    conversion.result.kind !== "primitive" || conversion.result.primitive !== "float64" || !Object.isFrozen(conversion.result) ||
    !facts.values.has(conversion.origin)) return conflict(use,
    "Exact number erasure requires an int64 value, its Host numeric origin and a float64 result.");
  if (input !== source) return conflict(use,
    "The Host admits exact number erasure at an optional int64 carrier; C# realizes the erasure only from the int64 carrier itself.");
  return Object.freeze({ use, input, result: csharpSourcePrimitiveTargetType(conversion.result.primitive), origin: conversion.origin });
}

function conflict(use: Node, message: string): never {
  return failTargetAnalysisInvariant("tsonic-csharp", message, use);
}
