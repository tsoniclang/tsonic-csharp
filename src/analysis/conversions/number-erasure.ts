import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorsEqual, type SourceProgramFacts, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { isCsharpRefusal, type CsharpRepresentation } from "../../representation/index.js";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";
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
 * erasure for `exact-number-erasure`, undefined for `identity` (an explicitly authored int64/bigint keeps its box) or a
 * conversion at which no admission exists. Missing, foreign or conflicting evidence is an invariant failure (I4); a
 * refused admission cannot reach here because every Host refusal is forwarded before C# analysis
 * (analysis/program/analyze.ts).
 *
 * The admission is required where the Host names the destination of the use (`values.contextual`) and that destination
 * maps to a broad carrier: the Host slot is broad there. A use with no Host destination (an operand of an operation, a
 * target-internal box) flows into no Host slot and has no slot admission, so none is read.
 */
export function readCsharpNumberErasure(host: CsharpNumberErasureHost, use: Node, source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined, mode: CsharpConversionMode): CsharpNumberErasure | undefined {
  if (!csharpNumberErasureCandidate(source, target, mode)) return undefined;
  const { facts } = host;
  const contextual = facts.values.contextual(use);
  if (contextual === undefined || contextual.kind === "refused") return undefined;
  const destination = host.represent(contextual.type, use);
  if (isCsharpRefusal(destination) || !csharpNumberErasureCandidate(source, destination, mode)) return undefined;
  // Throws (Host invariant) when the Host published no admission at this broad use.
  const admission = facts.values.admission(use);
  if (admission.use !== use) return conflict(use, "The Host slot admission belongs to another occurrence.");
  if (admission.kind === "refused") return conflict(use,
    "A refused Host slot admission reached C# analysis; Host refusals are forwarded before any C# analysis.");
  const slot = facts.values.slot(admission.slot);
  if (slot.kind !== "slot" || slot.slot !== admission.slot || slot.type !== admission.destination || !slot.broad) return conflict(use,
    "The Host slot admission requires its exact published broad declared slot and frozen destination.");
  if (!Object.isFrozen(admission) || !Object.isFrozen(admission.destination) || !Object.isFrozen(admission.conversion)) return conflict(use,
    "The Host slot admission must be a frozen publication.");
  const value = facts.values.type(use);
  if (value.kind === "refused" || !sourceTypeDescriptorsEqual(value.type, admission.value)) return conflict(use,
    "The Host slot admission requires the published value of the same occurrence.");
  const conversion = admission.conversion;
  if (conversion.kind === "identity") return undefined;
  if (admission.value.kind !== "primitive" || admission.value.primitive !== "int64" ||
    conversion.result.kind !== "primitive" || conversion.result.primitive !== "float64" || !Object.isFrozen(conversion.result) ||
    !facts.values.has(conversion.origin)) return conflict(use,
    "Exact number erasure requires an int64 value, its Host numeric origin and a float64 result.");
  return Object.freeze({ use, input: source!, result: csharpSourcePrimitiveTargetType(conversion.result.primitive), origin: conversion.origin });
}

function conflict(use: Node, message: string): never {
  return failTargetAnalysisInvariant("tsonic-csharp", message, use);
}
