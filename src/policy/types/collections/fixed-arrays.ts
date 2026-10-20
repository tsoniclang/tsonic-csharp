import type { TsonicFixedArrayFact } from "@tsonic/source-core/facts";

export function csharpFixedArrayRepresentationRejection(fact: TsonicFixedArrayFact): string | undefined {
  if (fact.length > 2_147_483_647n) {
    return `C# FixedArray extent ${fact.length} exceeds the implemented signed 32-bit T[].Length range (0..2147483647).`;
  }
  return undefined;
}
