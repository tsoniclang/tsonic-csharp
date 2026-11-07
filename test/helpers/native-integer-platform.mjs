// Host platform facts doubles for policy tests that call the C# literal checks directly (Q89/Q90). The fit is the
// Host's `facts.analyses.platform.nativeIntegerFit`; these doubles state one premise each, with the N5/E24 answers
// for that premise: a known width checks its bounds; a missing premise refuses only where 32 and 64 bits differ.
const bounds = (primitive, bits) => primitive === "native-int"
  ? [-(1n << BigInt(bits - 1)), (1n << BigInt(bits - 1)) - 1n] : [0n, (1n << BigInt(bits)) - 1n];
const within = (value, [low, high]) => value >= low && value <= high;

function knownPlatform(bits) {
  return Object.freeze({ kind: "known", nativeIntegerBits: bits, basis: `test ${bits}-bit premise`,
    nativeIntegerFit: (value, primitive) => within(value, bounds(primitive, bits)) ? "fits" : "does-not-fit" });
}

/** The 64-bit premise: the fixed bounds the C# literal checks used before Q89. */
export const knownNativePlatform64 = knownPlatform(64);
export const knownNativePlatform32 = knownPlatform(32);
export const missingNativePlatform = Object.freeze({ kind: "missing", reason: "test: no premise.",
  nativeIntegerFit: (value, primitive) => {
    const answers = new Set([32, 64].map(bits => within(value, bounds(primitive, bits))));
    return answers.size === 2 ? "refused" : answers.has(true) ? "fits" : "does-not-fit";
  } });
