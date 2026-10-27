import assert from "node:assert/strict";
import test from "node:test";
import { selectProviderConversionOperator } from "../../../dist/policy/conversions/provider-operators.js";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../dist/target-model/types/render-shapes.js";
import { compileCsharpSource, compileCsharpAnalysisTarget, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

test("native operator lookup uses the existing canonical metadata identity rather than an unbound target id", () => {
  const source = csharpBigIntegerTargetType();
  const target = csharpSourcePrimitiveTargetType("int64");
  const physical = csharpTargetNamedType("Native::System.Numerics.BigInteger", undefined,
    csharpQualifiedTypeRenderShape("System.Numerics", "BigInteger"), { allowsRefLikeTypeArguments: [], valueType: true });
  const operator = { id: "Native.BigInteger.op_Explicit.Int64", conversionKind: "explicit",
    declaringType: physical, sourceType: physical, targetType: target };
  const binding = { id: "Native::System.Numerics.BigInteger", sourceName: "BigInteger",
    targetName: "System.Numerics.BigInteger", target: "csharp", kind: "struct", csharpType: physical,
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

test("metadata-name conversion requires the resolved physical owner and exact operator operand identity", () => {
  const source = csharpBigIntegerTargetType();
  const target = csharpSourcePrimitiveTargetType("int64");
  const named = id => csharpTargetNamedType(id, undefined,
    csharpQualifiedTypeRenderShape("System.Numerics", "BigInteger"), { allowsRefLikeTypeArguments: [], valueType: true });
  const physical = named("Native::System.Numerics.BigInteger");
  for (const [label, csharpType, operatorSource] of [
    ["missing physical owner", undefined, source],
    ["same spelling from a different native owner", physical, named("Foreign::System.Numerics.BigInteger")],
  ]) {
    const binding = { id: "Native::System.Numerics.BigInteger", sourceName: "BigInteger",
      targetName: "System.Numerics.BigInteger", target: "csharp", kind: "struct", csharpType,
      conversionOperators: [{ id: "exact-operator", conversionKind: "explicit", declaringType: physical,
        sourceType: operatorSource, targetType: target }] };
    const selected = selectProviderConversionOperator({ providers: {
      findTargetBindingByMetadataName: () => ({ kind: "resolved", binding }),
      findTargetBindingByTargetId: () => assert.fail("the exact metadata identity never retries a native target id"),
    } }, source, target, "explicit");
    assert.equal(selected.kind, "none", `${label}: a spelling cannot fabricate exact native operand correspondence`);
  }
});

test("metadata operands substitute the acquired generic owner on either side of the operator", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const parameter = { kind: "type-parameter", identity: "Fixture.Box:Value", name: "Value" };
  const named = (id, element) => csharpTargetNamedType(id, [element],
    csharpQualifiedTypeRenderShape("Fixture", "Box"), { allowsRefLikeTypeArguments: [false], valueType: true });
  const canonical = named("Fixture.Box`1", integer);
  const physical = named("Native::Fixture.Box`1", parameter);
  for (const direction of ["source", "target"]) {
    let reads = 0;
    const operator = { id: `Fixture.Box.${direction}`, conversionKind: "explicit", declaringType: physical,
      sourceType: direction === "source" ? physical : integer,
      targetType: direction === "target" ? physical : integer };
    const binding = { id: "Native::Fixture.Box`1", sourceName: "Box", targetName: "Fixture.Box`1",
      target: "csharp", kind: "struct", csharpType: physical, typeParameters: [parameter],
      conversionOperators: [operator] };
    const selected = selectProviderConversionOperator({ providers: {
      findTargetBindingByMetadataName(name, purpose) {
        assert.equal(name, "Fixture.Box`1", `${direction}: exact generic metadata owner`);
        assert.equal(purpose, "ordinary", `${direction}: no runtime preparation`);
        reads += 1;
        return { kind: "resolved", binding };
      },
      findTargetBindingByTargetId: () => assert.fail("an acquired generic owner never retries by target id"),
    } }, direction === "source" ? canonical : integer,
    direction === "target" ? canonical : integer, "explicit");
    assert.equal(selected.kind === "cast" && selected.providerOperatorId === operator.id, true,
      `${direction}: actual acquired generic operands correspond after substitution`);
    assert.equal(reads, 1, `${direction}: the native owner is acquired once`);
  }
});

for (const surface of ["native", "js"]) {
  test(`native arbitrary-precision explicit conversion uses exact operator metadata and native overflow on ${surface}`, () => {
    const nativeEvidence = [];
    const compiled = compileCsharpSource({ surface, compileTarget(request, observer) {
      const capture = method => (identity, purpose) => {
        const resolution = request.providers[method](identity, purpose);
        if (identity.includes("BigInteger") && nativeEvidence.length < 8) {
          const binding = resolution.kind === "resolved" ? resolution.binding : undefined;
          const operators = binding?.conversionOperators ?? [];
          nativeEvidence.push({ method, identity, purpose, kind: resolution.kind, bindingId: binding?.id,
            physical: binding?.csharpType === undefined ? undefined : targetTypeRefKey(binding.csharpType),
            operatorCount: operators.length,
            operators: operators.filter(operator => /int64|Int64/u.test(targetTypeRefKey(operator.sourceType)) ||
              /int64|Int64/u.test(targetTypeRefKey(operator.targetType))).slice(0, 8).map(operator => ({
                id: operator.id, kind: operator.conversionKind,
                source: targetTypeRefKey(operator.sourceType), target: targetTypeRefKey(operator.targetType),
              })),
          });
        }
        return resolution;
      };
      return compileCsharpAnalysisTarget({ ...request, providers: { ...request.providers,
        findTargetBindingByMetadataName: capture("findTargetBindingByMetadataName"),
        findTargetBindingByTargetId: capture("findTargetBindingByTargetId"),
      } }, observer);
    }, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function convert(value: bigint): int64 { return value as int64; }
` });
    assert.equal(compiled.result.diagnostics.length, 0, `${compiled.result.diagnostics.slice(0, 8)
      .map(issue => `${issue.code}: ${issue.message}`).join(" | ")}; actual native operator evidence: ${JSON.stringify(nativeEvidence)}`);
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
