import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsObjectCallPolicies } from "../../../dist/policy/operations/source-profiles/js/objects.js";
import { csharpBigIntegerTargetType, csharpNullableTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTargetNamedType, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const selectedIs = csharpJsObjectCallPolicies.find(policy =>
  policy.source.declaringName === "ObjectConstructor" && policy.source.name === "is");
const primitives = ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
  "nativeInt", "nativeUint", "int128", "uint128", "float16", "float32", "float64", "decimal", "bool", "char"];

function select(value, other) {
  const arguments_ = [value, other].map(() => ({ expression: {}, type: {} }));
  return selectedIs.select({
    source: { sourceSelectedSignatureKind: "resolved", sourceSelectedSignatureParameters: [{}, {}],
      sourceArguments: arguments_, sourceArgumentBindings: arguments_.map((_, index) => ({
        sourceArgumentIndex: index, effectiveArgumentIndex: index, sourceParameterIndex: index, sourceForm: "value",
      })) },
    inputs: { values: new Map(arguments_.map((argument, index) => [argument.expression,
      new Map([[argument.type, [value, other][index]]])])) },
  });
}

test("Object.is publishes exact completed native scalar slots without widening or boxing", () => {
  const carriers = [...primitives.map(csharpSourcePrimitiveTargetType), csharpStringTargetType(), csharpBigIntegerTargetType()];
  for (const value of carriers) {
    for (const other of carriers) {
      const selected = select(value, other);
      assert.equal(selected.kind, "resolved", "every exact native pair closes the one runtime API");
      const parameters = selected.call.targetMember.parameters;
      assert.equal(parameters.length, 2, "two original arguments");
      assert.equal(targetTypeRefEquals(parameters[0].type, value), true, "original left native carrier");
      assert.equal(targetTypeRefEquals(parameters[1].type, other), true, "original right native carrier");
      assert.equal(selected.call.arguments.every((argument, index) =>
        argument.sourceArgumentIndex === index && argument.targetParameter === parameters[index]), true,
      "exact source order and native parameter identities");
    }
  }
});

test("Object.is keeps one explicit closed-value boundary for non-scalar and absent inputs", () => {
  const record = csharpTargetNamedType("project.Record", undefined, undefined, { allowsRefLikeTypeArguments: [] });
  for (const pair of [[record, record], [csharpNullableTargetType(record), record],
    [undefined, csharpSourcePrimitiveTargetType("int64")]]) {
    const selected = select(...pair);
    assert.equal(selected.kind, "resolved");
    assert.equal(selected.call.targetMember.parameters.every(parameter =>
      targetTypeRefEquals(getCsharpNullableElementTargetType(parameter.type), csharpObjectTargetType())), true,
    "already boxed or absent values retain the actual two object? native formals");
  }
});

test("native Object.is execution keeps exact widths, operand order, identity and handwritten allocation", { timeout: 300_000 }, () => {
  const scalars = [
    ["int8", "sbyte", "sbyte.MinValue"], ["uint8", "byte", "byte.MaxValue"],
    ["int16", "short", "short.MinValue"], ["uint16", "ushort", "ushort.MaxValue"],
    ["int32", "int", "int.MinValue"], ["uint32", "uint", "uint.MaxValue"],
    ["int64", "long", "long.MinValue"], ["uint64", "ulong", "ulong.MaxValue"],
    ["nativeInt", "nint", "nint.MinValue"], ["nativeUint", "nuint", "nuint.MaxValue"],
    ["int128", "System.Int128", "System.Int128.MinValue"], ["uint128", "System.UInt128", "System.UInt128.MaxValue"],
    ["float16", "System.Half", "System.Half.NaN"], ["float32", "float", "float.NaN"],
    ["float64", "double", "double.NaN"], ["decimal", "decimal", "decimal.MaxValue"],
    ["bigint", "System.Numerics.BigInteger", "System.Numerics.BigInteger.One << 1000"],
    ["boolean", "bool", "true"], ["char", "char", "'x'"], ["string", "string", "\"value\""],
  ];
  const sourceText = `
import type { ${scalars.filter(([name]) => !["bigint", "boolean", "string"].includes(name)).map(([name]) => name).join(", ")} } from "@tsonic/core/types.js";
${scalars.map(([name]) => `export function same_${name}(value: ${name}, other: ${name}): boolean { return Object.is(value, other); }`).join("\n")}
export function mixed(value: int64, other: float64): boolean { return Object.is(value, other); }
export function fraction(value: decimal, other: float64): boolean { return Object.is(value, other); }
let events = "";
function left(): int64 { events += "L"; return 9007199254740993n as int64; }
function right(): int64 { events += "R"; return 9007199254740992n as int64; }
export function order(): boolean {
  events = "";
  const equal = Object.is(left(), right());
  return !equal && events === "LR";
}
export function identity(value: object, other: object): boolean { return Object.is(value, other); }
`;
  const compiled = compileCsharpSource({ surface: "js", sourceText });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  for (const [name] of scalars) {
    const start = output.indexOf(`bool same_${name}(`);
    assert.equal(start >= 0, true, `${name}: original scalar function is emitted`);
    const body = output.slice(start).split("}")[0];
    assert.match(body, /Object\.@?is\(value, other\)/u, `${name}: exact native API arguments`);
    assert.doesNotMatch(body, /\(object\)|TsValue|Convert\.ToDouble|DynamicInvoke|System\.Reflection/u,
      `${name}: no hidden boxing or width transport`);
  }
  const native = executeCsharpConstruction(compiled, "object-is-native-domains", false, false, [], `
using System;
using System.Diagnostics;
using Subject = Tsonic.Generated.Index;
${scalars.map(([name, type, value]) => `if (!Subject.same_${name}((${type})(${value}), (${type})(${value}))) throw new Exception("${name} native SameValue");`).join("\n")}
if (Subject.same_int64(9007199254740993L, 9007199254740992L) ||
    Subject.same_uint64(ulong.MaxValue, ulong.MaxValue - 1) ||
    Subject.mixed(9007199254740993L, 9007199254740992d) ||
    Subject.fraction(0.1m, 0.1d) || !Subject.fraction(0.5m, 0.5d) ||
    Subject.same_float64(0d, -0d) || !Subject.order()) throw new Exception("exact domains or evaluation order");
var original = new EqualByValue();
if (!Subject.identity(original, original) || Subject.identity(original, new EqualByValue()))
    throw new Exception("original native reference identity");
long sink = 0;
for (long index = 0; index < 40000; index++) {
    if (Selected(index, index)) sink++;
    if (Native(index, index)) sink++;
}
var selectedTicks = long.MaxValue;
var nativeTicks = long.MaxValue;
for (var round = 0; round < 3; round++) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    var started = Stopwatch.GetTimestamp();
    for (long index = 0; index < 1000000; index++) if (Selected(index, index)) sink++;
    selectedTicks = Math.Min(selectedTicks, Stopwatch.GetTimestamp() - started);
    var selectedBytes = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    started = Stopwatch.GetTimestamp();
    for (long index = 0; index < 1000000; index++) if (Native(index, index)) sink++;
    nativeTicks = Math.Min(nativeTicks, Stopwatch.GetTimestamp() - started);
    var nativeBytes = GC.GetAllocatedBytesForCurrentThread() - before;
    if (nativeBytes != 0 || selectedBytes != nativeBytes) throw new Exception($"SameValue allocation:{selectedBytes}:{nativeBytes}");
}
if (sink != 6080000 || selectedTicks > 3 * nativeTicks) throw new Exception($"SameValue native cost:{sink}:{selectedTicks}:{nativeTicks}");
Console.WriteLine($"same-value:True:0:0:{selectedTicks}:{nativeTicks}");
[System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
static bool Selected(long value, long other) => Subject.same_int64(value, other);
[System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
static bool Native(long value, long other) => value == other;
sealed class EqualByValue {
    public override bool Equals(object? other) => other is EqualByValue;
    public override int GetHashCode() => 0;
}
`);
  assert.match(native, /same-value:True:0:0:/u, "all scalar/native identity controls and native cost execute");
});
