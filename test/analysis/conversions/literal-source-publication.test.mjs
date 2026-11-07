import { knownNativePlatform64 } from "../../helpers/native-integer-platform.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { coalesceCsharpExactLiteralRequests, createCsharpExactLiteralRequestCollector } from "../../../dist/analysis/conversions/literal-requests.js";
import { createCsharpExactLiteralProducer } from "../../../dist/analysis/program/records/operations/exact-literals.js";
import { selectCsharpExactLiteralConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const literalConversion = Object.freeze({ kind: "implicit", proof: "literal" });
const noOperations = Object.freeze({ unaryOperation: Object.freeze({ get: () => undefined }) });
const [negativeZero, writtenFloatZero] = checkedSourceLiteralValues(["-0", "-0.0"]);
// The literal owners read facts.values.literal (nextgen C-2542); this double publishes exactly the one constant.
const valuesFor = (expression, value = negativeZero) => Object.freeze({
  values: Object.freeze({ literal: node => node === expression ? value : undefined }),
});
const invariant = text => error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" &&
  error.message.includes(text);

test("literal publication requires the current source field and separates the property-key role", () => {
  const expression = {};
  const target = primitive("float64");
  assert.throws(() => coalesceCsharpExactLiteralRequests([{ expression, target }]),
    invariant("requires its completed native source field"));
  const propertyKey = Object.freeze({ kind: "resolved", name: "0", constant: { kind: "string", value: "0" } });
  assert.throws(() => coalesceCsharpExactLiteralRequests([{ expression, target,
    source: primitive("int64"), propertyKey }]), invariant("has no runtime value source"));
  const keyTarget = csharpStringTargetType();
  const selected = analyzeCsharpExactLiteralSelections(valuesFor(expression), [
    { expression, source: primitive("int64"), target },
    { expression, source: undefined, target: keyTarget, propertyKey },
  ], [expression]).exactLiteral;
  assert.equal(selected.get(expression, target)?.recipe?.negative === false, true, "the runtime zero is integral");
  assert.deepEqual(selected.get(expression, keyTarget, "property-key"),
    { kind: "resolved", recipe: { kind: "string", value: "0" } });
  assert.equal(selected.get(expression, keyTarget) === undefined, true, "a property key is not a value endpoint");
});

test("target-only requests acquire the same source before the single publication in either order", () => {
  const expression = {};
  const target = primitive("float64");
  const source = primitive("int64");
  const targetOnly = Object.freeze({ expression, target, source: undefined });
  const sourced = Object.freeze({ expression, target, source });
  for (const requests of [[targetOnly, sourced], [sourced, targetOnly]]) {
    const coalesced = coalesceCsharpExactLiteralRequests(requests);
    assert.equal(coalesced.length === 1 && coalesced[0].source === source && Object.isFrozen(coalesced), true,
      "one completed endpoint is independent of request order");
    const result = analyzeCsharpExactLiteralSelections(valuesFor(expression), requests, [expression]);
    assert.deepEqual(result.exactLiteral.get(expression, target), { kind: "resolved", recipe: {
      kind: "float", target, precision: "float64", token: { significand: "0" }, negative: false,
    } });
  }
});

test("the literal collector keeps ordered use requests while sharing one source per endpoint", () => {
  const expression = {};
  const source = primitive("int64");
  const target = primitive("float64");
  const collector = createCsharpExactLiteralRequestCollector(valuesFor(expression));
  collector.requestReads(expression, undefined, [], [target], noOperations);
  collector.requestReads(expression, source, [], [target], noOperations);
  const requests = collector.seal();
  assert.equal(requests.length, 4, "both original ordered source uses remain visible");
  assert.equal(requests.every(request => request.source === source && Object.isFrozen(request)), true,
    "every reference receives the same completed source");
  assert.equal(requests[0] === requests[2] && requests[1] === requests[3], true,
    "duplicate uses share the canonical endpoint request");
  collector.requestConversion(expression, source, target, literalConversion, source);
  assert.throws(() => collector.requestConversion(expression, source, target, literalConversion, primitive("float64")),
    invariant("one completed native source carrier"));
  assert.equal(requests.length, 4, "a conflict after the seal never changes the ordered requests");
});

test("conflicting sources never become first-wins before or after publication", () => {
  const expression = {};
  const source = primitive("int64");
  const other = primitive("float64");
  const target = primitive("float32");
  assert.throws(() => coalesceCsharpExactLiteralRequests([
    { expression, source, target }, { expression, source: other, target },
  ]), invariant("one completed native source carrier"));
  const collector = createCsharpExactLiteralRequestCollector(valuesFor(expression));
  collector.requestConversion(expression, source, target, literalConversion, source);
  assert.throws(() => collector.requestConversion(expression, source, target, literalConversion, other),
    invariant("one completed native source carrier"));
  const unknown = createCsharpExactLiteralRequestCollector(valuesFor(expression));
  unknown.requestConversion(expression, source, target, literalConversion, undefined);
  unknown.seal();
  assert.throws(() => unknown.requestConversion(expression, source, target, literalConversion, source),
    invariant("required before literal publication"));
  const producer = createCsharpExactLiteralProducer();
  const selected = selectCsharpExactLiteralConversion(negativeZero, source, target, knownNativePlatform64);
  producer.select(expression, target, "value", source, selected);
  assert.equal(producer.has(expression, target, "value", primitive("int64")), true, "source identity is structural");
  assert.throws(() => producer.has(expression, target, "value", other), invariant("one completed native source carrier"));
  assert.throws(() => producer.select(expression, target, "value", source, selected), invariant("publishes once"));
  const sealed = producer.seal();
  assert.equal(sealed.exactLiteral.get(expression, target) === selected, true, "one immutable published decision");
  assert.equal(producer.has(expression, target, "value", source), true);
  assert.throws(() => producer.has(expression, target, "value", other), invariant("one completed native source carrier"));
  assert.throws(() => producer.select(expression, target, "value", other, selected), invariant("one completed native source carrier"));
  assert.throws(() => producer.seal(), invariant("publication is closed"));
});

test("source-less publication cannot silently acquire a source after selection", () => {
  const expression = {};
  const target = primitive("float64");
  const producer = createCsharpExactLiteralProducer();
  producer.select(expression, target, "value", undefined, { kind: "not-applicable" });
  assert.throws(() => producer.has(expression, target, "value", primitive("int64")),
    invariant("one completed native source carrier"));
  const selected = producer.seal().exactLiteral.get(expression, target);
  assert.equal(selected.kind, "not-applicable", "a rejected late source cannot mutate a published recipe");
});

test("nullable, union, boxing and adapter endpoints retain the completed literal source", () => {
  const expression = {};
  const source = primitive("int64");
  const float = primitive("float64");
  const text = csharpStringTargetType();
  const collector = createCsharpExactLiteralRequestCollector(valuesFor(expression));
  collector.requestConversion(expression, source, text, { kind: "provider-argument-adapter",
    adapter: { inputType: float, resultType: primitive("int32") }, sourceToInput: literalConversion,
    resultToTarget: { kind: "js-value-box" } }, source);
  collector.requestConversion(expression, csharpNullableTargetType(source), csharpNullableTargetType(float), {
    kind: "nullable-map", sourceElement: source, targetElement: float, conversion: literalConversion,
  }, source);
  collector.requestConversion(expression, source, text, { kind: "implicit", proof: "runtime-union-arm",
    armIndex: 0, armType: float, sourceToArm: literalConversion }, source);
  assert.equal(collector.requests.every(request => request.source === source), true,
    "the adapter output, nullable payload and union arm never replace the node's completed source");
  const selected = analyzeCsharpExactLiteralSelections(valuesFor(expression), collector.seal(), [expression]);
  assert.equal(selected.exactLiteral.get(expression, float)?.recipe?.negative === false, true);
  assert.equal(selected.exactLiteral.get(expression, primitive("int32"))?.recipe?.value === 0n, true,
    "the intermediate boxing endpoint is still published");
});

test("integral zero is positive at every float endpoint and floating zeros retain their signs", () => {
  for (const precision of ["float16", "float32", "float64", "decimal"]) {
    const target = primitive(precision);
    for (const destination of [target, csharpNullableTargetType(target)]) {
      for (const name of ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "int128", "uint128", "native-int", "native-uint"]) {
        const source = primitive(name);
        for (const carrier of [source, csharpNullableTargetType(source)]) {
          const selected = selectCsharpExactLiteralConversion(negativeZero, carrier, destination, knownNativePlatform64);
          assert.equal(selected.kind === "resolved" && selected.recipe.kind === "float" && selected.recipe.negative === false,
            true, `${name} -> ${precision}: completed integral zero is positive`);
          assert.equal(precision !== "float16" || selected.recipe.bits === 0, true, `${name}: positive Half bits`);
        }
      }
      for (const name of ["float16", "float32", "float64", "decimal"]) {
        for (const value of [negativeZero, writtenFloatZero]) {
          const selected = selectCsharpExactLiteralConversion(value, primitive(name), destination, knownNativePlatform64);
          assert.equal(selected.kind === "resolved" && (selected.recipe.kind === "signed-zero" ||
            selected.recipe.kind === "float" && selected.recipe.negative === true), true,
          `${name} -> ${precision}: declared or written floating zero keeps its sign`);
          assert.equal(precision !== "float16" || selected.recipe.bits === 0x8000, true, "negative Half bits");
        }
      }
    }
    assert.equal(selectCsharpExactLiteralConversion(negativeZero, undefined, target, knownNativePlatform64).kind, "not-applicable",
      "an absent source never guesses the zero's native carrier");
  }
});

for (const surface of ["native", "js"]) test(`${surface} completed integral zero and declared floating zero keep native bits without allocation`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32, float64 } from "@tsonic/core/types.js";
    export function integralZero(): float64 { return -0 as int32; }
    export function declaredZero(): float64 { const value: float64 = -0; return value; }
    export function writtenZero(): float64 { return -0.0; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, `completed-literal-zero-${surface}`, false, false, [], `
    using System;
    using System.Runtime.CompilerServices;
    static class Program {
      [MethodImpl(MethodImplOptions.NoInlining)]
      static long Generated() => BitConverter.DoubleToInt64Bits(Tsonic.Generated.Index.integralZero()) |
        (BitConverter.DoubleToInt64Bits(Tsonic.Generated.Index.declaredZero()) ^ long.MinValue) |
        (BitConverter.DoubleToInt64Bits(Tsonic.Generated.Index.writtenZero()) ^ long.MinValue);
      [MethodImpl(MethodImplOptions.NoInlining)]
      static long Handwritten() => BitConverter.DoubleToInt64Bits((double)0) |
        (BitConverter.DoubleToInt64Bits(-0D) ^ long.MinValue) |
        (BitConverter.DoubleToInt64Bits(-0D) ^ long.MinValue);
      static void Main() {
        for (int index = 0; index < 10000; index++) {
          if (Generated() != 0 || Handwritten() != 0) throw new Exception("native zero bits");
        }
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int index = 0; index < 10000; index++)
          if (Generated() != 0) throw new Exception("generated native zero bits");
        long generated = GC.GetAllocatedBytesForCurrentThread() - before;
        before = GC.GetAllocatedBytesForCurrentThread();
        for (int index = 0; index < 10000; index++)
          if (Handwritten() != 0) throw new Exception("handwritten native zero bits");
        long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
        if (generated != 0 || handwritten != 0 || generated != handwritten)
          throw new Exception($"native literal cost {generated} != {handwritten}");
      }
    }
  `);
});
