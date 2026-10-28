import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { selectCsharpUnionArmMapping } from "../../../dist/policy/conversions/union-relations.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, getCsharpRuntimeUnionArms, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const policy = { projectTypes: { directSupertypes: () => [] },
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }), findTargetBindingByMetadataName: () => ({ kind: "missing" }) }, target: {} };

for (const payload of [csharpSourcePrimitiveTargetType("int32"), csharpSourcePrimitiveTargetType("int64"),
  csharpSourcePrimitiveTargetType("float64"), csharpStringTargetType()]) {
  test(`every ordered native union slot retains its exact ${payload.name ?? payload.id} payload`, () => {
    const source = csharpRuntimeUnionTargetType([payload, csharpRuntimeUnionTargetType([payload, payload])]);
    const selected = selectCsharpConversion(policy, source, payload, "implicit");
    assert.equal(selected.kind === "union-map" && selected.coverage === "source" && selected.arms.length === 3, true,
      "every physical payload path is admitted without changing the generic native union layout");
    assert.equal(selected.arms.every(arm => targetTypeRefEquals(arm.carrier, payload) && arm.target.length === 0), true,
      "each source tag exposes precisely the same native destination carrier");
    assert.equal(selected.arms.map(arm => arm.source.map(step => step.index).join(".")).join(","), "0,1.0,1.1",
      "ordered duplicate slots remain distinct physical source paths");
    assert.equal(admitCsharpConversionSelection(policy, source, payload, selected) === selected, true,
      "the existing pre-seal owner admits the complete exact mapping");
    assert.equal(getCsharpRuntimeUnionArms(source).length === 2 &&
      getCsharpRuntimeUnionArms(getCsharpRuntimeUnionArms(source)[1]).length === 2, true,
    "neither physical generic arity nor nested declaration order is flattened");
    for (const forged of [
      { ...selected, arms: selected.arms.slice(1) },
      { ...selected, arms: [selected.arms[0], selected.arms[0], selected.arms[2]] },
      { ...selected, arms: selected.arms.map(arm => ({ ...arm, carrier: csharpSourcePrimitiveTargetType("bool") })) },
    ]) assert.equal(admitCsharpConversionSelection(policy, source, payload, forged).kind, "rejected",
      "partial, duplicate-path and changed-carrier evidence cannot reach the planner");
    assert.equal(admitCsharpConversionSelection(policy, csharpNullableTargetType(source), payload, selected).kind, "rejected",
      "source coverage cannot discard an outer native absence state");
    assert.equal(selectCsharpUnionArmMapping(source, payload, "target") === undefined, true,
      "an exact payload extraction is not a target-coverage narrowing guess");
  });
}

test("native payload extraction never weakens heterogeneous or ambiguous destination selection", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const source = csharpRuntimeUnionTargetType([integer, integer]);
  for (const target of [floating, csharpRuntimeUnionTargetType([integer, integer])]) {
    assert.equal(selectCsharpUnionArmMapping(source, target, "source") === undefined, true,
      "a numeric width change or ambiguous destination slot is not exact native extraction");
  }
  assert.equal(selectCsharpUnionArmMapping(csharpRuntimeUnionTargetType([integer, floating]), floating, "source") === undefined, true,
    "one matching arm cannot erase a different retained native payload");
});

for (const surface of ["native", "js"]) {
  test(`closed equal union payloads preserve native generic ABI, evaluation and allocation on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let reads = 0;
function observed(value: number): number { reads += 1; return value; }
function choose<Value>(value: Value, other: number, first: boolean): Value | number {
  if (first) return value;
  return other;
}
export function invoke(value: number, other: number, first: boolean): number {
  return choose<number>(value, other, first);
}
export function run(): boolean {
  reads = 0;
  const first: number = choose<number>(observed(7), 11, true);
  const second: number = choose<number>(13, observed(17), false);
  return first === 7 && second === 17 && reads === 2;
}` });
    const source = createTargetSourceProgram(compiled.source);
    assert.equal(compiled.result.diagnostics.length === 0, true, JSON.stringify(compiled.result.diagnostics.map(issue => ({
      code: issue.code, message: issue.message,
      expression: issue.sourceNode === undefined ? undefined : source.ast.text(issue.sourceNode).slice(0, 256),
      span: issue.sourceSpan,
    }))));
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/DynamicInvoke|\.Match\(|\.ToObject\(|Convert\.ToDouble|Runtime\.TsValue/u.test(output), false,
      "native payload extraction adds no boxing, dynamic dispatch, callback or numeric repair");
    executeCsharpConstruction(compiled, `duplicate-native-union-payloads-${surface}`, false, false, [], `
using Index = Tsonic.Generated.Index;
using NativeUnion = Tsonic.CSharp.Runtime.Union<double, double>;
if (!Index.run()) throw new System.Exception("native union operand evaluation");
for (var warmup = 0; warmup < 10000; warmup++) { Index.invoke(7, 11, warmup % 2 == 0); Native(7, 11, warmup % 2 == 0); }
var before = System.GC.GetAllocatedBytesForCurrentThread();
double generated = 0;
for (var iteration = 0; iteration < 10000; iteration++) generated += Index.invoke(7, 11, iteration % 2 == 0);
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
double native = 0;
for (var iteration = 0; iteration < 10000; iteration++) native += Native(7, 11, iteration % 2 == 0);
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != native || generatedCost != nativeCost) throw new System.Exception($"native union allocation {generatedCost} != {nativeCost}");
before = System.GC.GetTotalAllocatedBytes(true);
for (var iteration = 0; iteration < 10000; iteration++) generated += Index.invoke(7, 11, iteration % 2 == 0);
generatedCost = System.GC.GetTotalAllocatedBytes(true) - before;
before = System.GC.GetTotalAllocatedBytes(true);
for (var iteration = 0; iteration < 10000; iteration++) native += Native(7, 11, iteration % 2 == 0);
nativeCost = System.GC.GetTotalAllocatedBytes(true) - before;
if (generated != native || generatedCost != nativeCost) throw new System.Exception($"all-thread native union allocation {generatedCost} != {nativeCost}");
static double Native(double value, double other, bool first) {
    NativeUnion selected = Choose<double>(value, other, first);
    return selected.Is1() ? selected.As1() : selected.As2();
}
static Tsonic.CSharp.Runtime.Union<Value, double> Choose<Value>(Value value, double other, bool first) => first
    ? Tsonic.CSharp.Runtime.Union<Value, double>.From1(value)
    : Tsonic.CSharp.Runtime.Union<Value, double>.From2(other);
`);
  });
}
