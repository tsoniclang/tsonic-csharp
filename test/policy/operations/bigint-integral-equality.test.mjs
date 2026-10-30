import assert from "node:assert/strict";
import test from "node:test";
import { validateBinaryTargetSemantics } from "../../../dist/policy/operations/operators/operator-validation.js";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/index.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const context = {
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
  projectTypes: { catalog: { definitionForTarget: () => undefined } },
};
const integralTypes = [
  ["char", "char"], ["int8", "sbyte"], ["uint8", "byte"], ["int16", "short"], ["uint16", "ushort"],
  ["int32", "int"], ["uint32", "uint"], ["int64", "long"], ["uint64", "ulong"],
  ["native-int", "nint"], ["native-uint", "nuint"], ["int128", "System.Int128"], ["uint128", "System.UInt128"],
];

for (const [name] of integralTypes) test(`native BigInteger equality admits exact ${name} in both orders`, () => {
  const big = csharpBigIntegerTargetType();
  const integer = csharpSourcePrimitiveTargetType(name);
  for (const operator of ["==", "!=", "===", "!=="]) {
    assert.equal(validateBinaryTargetSemantics(operator, big, integer, context) === undefined, true, `${name}: bigint ${operator} integer`);
    assert.equal(validateBinaryTargetSemantics(operator, integer, big, context) === undefined, true, `${name}: integer ${operator} bigint`);
  }
});

test("native BigInteger equality never admits floating, decimal, Boolean or foreign same-spelling carriers", () => {
  const big = csharpBigIntegerTargetType();
  const foreign = csharpTargetNamedType("Foreign::System.Numerics.BigInteger", [],
    { kind: "named", namespace: ["System", "Numerics"], name: "BigInteger" }, { allowsRefLikeTypeArguments: [], valueType: true });
  for (const name of ["float16", "float32", "float64", "decimal", "bool"]) {
    const other = csharpSourcePrimitiveTargetType(name);
    assert.equal(validateBinaryTargetSemantics("===", big, other, context) !== undefined, true, `${name}: not an exact native integer`);
    assert.equal(validateBinaryTargetSemantics("===", other, big, context) !== undefined, true, `${name}: reverse not an exact native integer`);
  }
  const integer = csharpSourcePrimitiveTargetType("uint64");
  assert.equal(validateBinaryTargetSemantics("===", foreign, integer, context) !== undefined, true, "foreign spelling has no native integer relation");
  assert.equal(validateBinaryTargetSemantics("===", integer, foreign, context) !== undefined, true, "reverse foreign spelling has no native integer relation");
});

const sourceText = `
import type { int64, uint64 } from "@tsonic/core/types.js";
export function equalUnsigned(left: bigint, right: uint64): boolean { return left === right; }
export function equalUnsignedReverse(left: uint64, right: bigint): boolean { return left === right; }
export function differentUnsigned(left: bigint, right: uint64): boolean { return left !== right; }
export function equalSigned(left: bigint, right: int64): boolean { return left === right; }
`;

for (const surface of [undefined, "js"]) test(`native BigInteger/integral equality retains exact values and idiomatic allocation on ${surface ?? "native"}`,
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /StrictEquals|strictEqual|Convert\.ToDouble|\(double\)/u,
      "exact native equality adds no floating conversion or dynamic equality shim");
    const nativeWidths = integralTypes.map(([name, nativeType]) => `
if (!(System.Numerics.BigInteger.One == (${nativeType})1) || !((${nativeType})1 == System.Numerics.BigInteger.One))
    throw new System.Exception("native ${name} equality is not available");`).join("\n");
    executeCsharpConstruction(compiled, `bigint-native-equality-${surface ?? "native"}`, false, false, [], `
${nativeWidths}
const ulong exact = 9007199254740993UL;
var big = new System.Numerics.BigInteger(exact);
if (!Tsonic.Generated.Index.equalUnsigned(big, exact) || !Tsonic.Generated.Index.equalUnsignedReverse(exact, big) ||
    Tsonic.Generated.Index.equalUnsigned(big, exact - 1) || !Tsonic.Generated.Index.differentUnsigned(big, exact - 1))
    throw new System.Exception("native uint64 equality lost exact precision");
if (!Tsonic.Generated.Index.equalUnsigned(new System.Numerics.BigInteger(ulong.MaxValue), ulong.MaxValue) ||
    !Tsonic.Generated.Index.equalSigned(new System.Numerics.BigInteger(long.MinValue), long.MinValue))
    throw new System.Exception("native integer boundary equality changed");
for (int index = 0; index < 1000; index++) {
    _ = Tsonic.Generated.Index.equalUnsigned(big, exact);
    _ = Tsonic.Generated.Index.equalUnsignedReverse(exact, big);
    _ = Handwritten(big, exact);
    _ = HandwrittenReverse(exact, big);
}
long before = System.GC.GetAllocatedBytesForCurrentThread();
int generatedMatches = 0;
for (int index = 0; index < 10000; index++)
    if (Tsonic.Generated.Index.equalUnsigned(big, exact) && Tsonic.Generated.Index.equalUnsignedReverse(exact, big)) generatedMatches++;
long generatedAllocation = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
int nativeMatches = 0;
for (int index = 0; index < 10000; index++)
    if (Handwritten(big, exact) && HandwrittenReverse(exact, big)) nativeMatches++;
long nativeAllocation = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generatedMatches != 10000 || nativeMatches != 10000 || generatedAllocation != nativeAllocation)
    throw new System.Exception($"native equality cost changed: generated={generatedAllocation}, native={nativeAllocation}");
static bool Handwritten(System.Numerics.BigInteger left, ulong right) => left == right;
static bool HandwrittenReverse(ulong left, System.Numerics.BigInteger right) => left == right;
`);
  });
