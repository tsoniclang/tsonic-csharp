// FixedArray<T, N> from Host facts (nextgen C-2542, I2, I4). A FixedArray reference is a `declared` descriptor whose
// declaration carries the canonical `fixed-array` type marker. Its element is the reference's first type argument and
// its extent N is the exact extent the Host publishes on that reference descriptor (writer A4; AGENT-C4-NOTES R-C4-1).
// C# never reads N from a checker Type or from authored syntax, and a FixedArray reference without its published
// extent is a missing Host fact (invariant failure), never an ordinary array.
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import { sourceMarkerFactKey, type Node, type ReadonlySourceFactResolver } from "@tsonic/tsts";

/** The .NET refusal code of a fixed array whose extent has no T[] representation (representation/declared.ts). */
export const csharpFixedArrayRefusalCode = "CSHARP_FIXED_ARRAY_REPRESENTATION_UNSUPPORTED";

/** N of FixedArray<T, N>: the exact non-negative extent and whether it was authored as a number or a bigint literal. */
export interface CsharpFixedArrayExtent {
  readonly length: bigint;
  readonly lengthRuntimeBase: "number" | "bigint";
}

/** A selected FixedArray: its Host element descriptor and extent. No checker Type, no authored node. */
export interface CsharpFixedArrayFact extends CsharpFixedArrayExtent {
  readonly element: SourceTypeDescriptor;
}

export interface CsharpFixedArraySelection {
  readonly kind: "selected";
  readonly fact: CsharpFixedArrayFact;
}

type DeclaredDescriptor = Extract<SourceTypeDescriptor, { readonly kind: "declared" }>;
/** The Host FixedArray reference descriptor with its published extent (request R-C4-1 to writer A4). */
type HostFixedArrayReference = DeclaredDescriptor & { readonly extent?: CsharpFixedArrayExtent };

/** Whether a declaration is the canonical FixedArray declaration (its `fixed-array` type marker). */
export function isCsharpFixedArrayDeclaration(sourceFacts: ReadonlySourceFactResolver | undefined, declaration: Node): boolean {
  const marker = sourceFacts?.getFact(declaration, sourceMarkerFactKey);
  return marker?.kind === "type-marker" && marker.marker === "fixed-array";
}

/**
 * The FixedArray a descriptor denotes, through optional and alias definitions, or undefined when it denotes none.
 * A FixedArray reference without its element or its published extent is an invariant failure (I4).
 */
export function selectCsharpFixedArray(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  descriptor: SourceTypeDescriptor,
  occurrence: Node,
): CsharpFixedArraySelection | undefined {
  let current: SourceTypeDescriptor | undefined = descriptor;
  const visited = new Set<SourceTypeDescriptor>();
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    if (current.kind === "optional") {
      current = current.value;
      continue;
    }
    if (current.kind !== "declared") return undefined;
    if (isCsharpFixedArrayDeclaration(sourceFacts, current.declaration)) {
      return Object.freeze({ kind: "selected", fact: csharpFixedArrayReference(current, occurrence) });
    }
    current = current.definition;
  }
  return undefined;
}

/** Element and extent of one FixedArray reference descriptor (its declaration is the FixedArray declaration). */
export function csharpFixedArrayReference(reference: DeclaredDescriptor, occurrence: Node): CsharpFixedArrayFact {
  const element = reference.typeArguments[0];
  if (element === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A FixedArray reference must publish its element type argument.", occurrence);
  const extent = (reference as HostFixedArrayReference).extent;
  if (extent === undefined || typeof extent.length !== "bigint" || extent.length < 0n ||
    (extent.lengthRuntimeBase !== "number" && extent.lengthRuntimeBase !== "bigint")) failTargetAnalysisInvariant("tsonic-csharp",
    "A FixedArray reference must publish its exact extent (Host fact).", occurrence);
  return Object.freeze({ element, length: extent.length, lengthRuntimeBase: extent.lengthRuntimeBase });
}

/** A .NET T[] has a signed 32-bit Length; a larger extent has no C# representation. */
export function csharpFixedArrayRepresentationRejection(extent: Pick<CsharpFixedArrayExtent, "length">): string | undefined {
  if (extent.length > 2_147_483_647n) {
    return `C# FixedArray extent ${extent.length} exceeds the implemented signed 32-bit T[].Length range (0..2147483647).`;
  }
  return undefined;
}
