export function csharpFixedArrayRepresentationRejection(length: bigint): string | undefined {
  if (length > 2_147_483_647n) {
    return `C# FixedArray extent ${length} exceeds the implemented signed 32-bit T[].Length range (0..2147483647).`;
  }
  return undefined;
}
