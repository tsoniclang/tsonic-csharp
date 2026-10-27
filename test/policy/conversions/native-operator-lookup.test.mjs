import assert from "node:assert/strict";
import test from "node:test";
import { selectProviderConversionOperator } from "../../../dist/policy/conversions/provider-operators.js";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../dist/target-model/types/render-shapes.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native operator lookup uses the existing canonical metadata identity rather than an unbound target id", () => {
  const source = csharpBigIntegerTargetType();
  const target = csharpSourcePrimitiveTargetType("int64");
  const operator = { id: "Native.BigInteger.op_Explicit.Int64", conversionKind: "explicit",
    declaringType: source, sourceType: source, targetType: target };
  const binding = { id: "Native::System.Numerics.BigInteger", sourceName: "BigInteger",
    targetName: "System.Numerics.BigInteger", target: "csharp", kind: "struct", csharpType: source,
    conversionOperators: [operator] };
  let reads = 0;
  const input = { providers: {
    findTargetBindingByTargetId() { assert.fail("a canonical metadata-only carrier has no assembly target id"); },
    findTargetBindingByMetadataName(name, purpose) {
      assert.equal(name, "System.Numerics.BigInteger", "the canonical metadata lookup owner selects the exact name");
      assert.equal(purpose, "ordinary", "conversion evidence does not request inheritance/runtime preparation");
      reads += 1;
      return { kind: "resolved", binding };
    },
  } };
  const selected = selectProviderConversionOperator(input, source, target, "explicit");
  assert.equal(selected.kind === "cast" && selected.proof === "provider-operator" &&
    selected.providerOperatorId === operator.id, true, "only the actual operator supplies the native explicit conversion");
  assert.equal(reads, 1, "one identity chooses one query, without retry or fallback");
  assert.equal(selectProviderConversionOperator(input, source, target, "implicit").kind, "none",
    "an explicit native operator is not silently made implicit");
});

test("assembly-bound native operators retain their target identity and never fall back to metadata spelling", () => {
  const source = csharpTargetNamedType("Native::Example.Value", undefined,
    csharpQualifiedTypeRenderShape("Example", "Value"), { allowsRefLikeTypeArguments: [] });
  const target = csharpSourcePrimitiveTargetType("int64");
  let reads = 0;
  const selected = selectProviderConversionOperator({ providers: {
    findTargetBindingByTargetId(id, purpose) {
      assert.equal(id, "Native::Example.Value", "the actual native assembly identity is authoritative");
      assert.equal(purpose, "ordinary", "the operator query retains its acquisition purpose");
      reads += 1;
      return { kind: "missing" };
    },
    findTargetBindingByMetadataName() { assert.fail("a missing native target id cannot become a spelling-based match"); },
  } }, source, target, "explicit");
  assert.equal(selected.kind, "none", "missing real evidence never fabricates an operator");
  assert.equal(reads, 1, "the exact native identity is queried once");
});

for (const surface of ["native", "js"]) {
  test(`native arbitrary-precision explicit conversion uses exact operator metadata and native overflow on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function convert(value: bigint): int64 { return value as int64; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/\(double\)|Convert\.ToDouble|TsValue|BigIntOps/u.test(generated), false,
      "the native operator has no floating or compatibility transport");
    executeCsharpConstruction(compiled, `native-operator-lookup-${surface}`, false, false, [], `
var exact = new System.Numerics.BigInteger(9007199254740993L);
if (Tsonic.Generated.Index.convert(exact) != 9007199254740993L)
    throw new System.Exception("exact native operator value");
bool overflow = false;
try { _ = Tsonic.Generated.Index.convert(System.Numerics.BigInteger.One << 100); }
catch (System.OverflowException) { overflow = true; }
if (!overflow) throw new System.Exception("native BigInteger operator overflow");
`);
  });
}
