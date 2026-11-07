import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileEffectiveSource, assertPublishedRefusal } from "../../helpers/source-effective-types.mjs";
import { csharpSourcePrimitiveTargetType, csharpTsValueTargetType, csharpObjectTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { readCsharpNumberErasure } from "../../../dist/analysis/conversions/number-erasure.js";

// Basis: N3′ (PLAN §10), WP0 A3, 03-DATA-MODEL E23 limits (C-2499, K-2621); the C# consumer of the Host
// `values.admission(use)` (K-2671). A Q1 int64 of number origin admitted into unknown with `exact-number-erasure` is
// converted exactly to double at that use and boxed as a number; the int64 producer and read stay intact. An explicitly
// authored int64 (`identity`) keeps its long box. Inexact and nonconstant values are Host refusals, forwarded.

const header = `import type { int64 } from "@tsonic/core/types.js";\n`;
const int64 = csharpSourcePrimitiveTargetType("int64");
const float64 = csharpSourcePrimitiveTargetType("float64");
const emitted = compiled => [...compiled.artifacts.entries()].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");

const erasureProgram = header + `
function category(value: unknown): string { return typeof value; }
function optional(value?: unknown): string { return typeof value; }
function give(): unknown { const produced = 1152921504606846976; return produced; }
export function run(): boolean {
  const wideFirst: int64 = 9007199254740993n as int64;
  const boxedFirst: unknown = wideFirst;
  const original = 1152921504606846976;
  const alias = original;
  const erased: unknown = alias;
  const negative = -1152921504606846976;
  const erasedNegative: unknown = negative;
  const computed = 1152921504606846976 + 0;
  const erasedComputed: unknown = computed;
  const absorbed: unknown | undefined = original;
  let assigned: unknown;
  assigned = original;
  const wide: int64 = 9007199254740993n as int64;
  const boxedWide: unknown = wide;
  return category(boxedFirst) === "bigint" && category(erased) === "number" && category(erasedNegative) === "number" &&
    category(erasedComputed) === "number" && category(absorbed) === "number" && category(assigned) === "number" &&
    category(original) === "number" && optional(alias) === "number" && category(give()) === "number" &&
    category(boxedWide) === "bigint" && original - 1152921504606846975 === 1 && alias - 1152921504606846975 === 1;
}`;

function sourceText(source, node) {
  const range = source.syntax.authoredRange(node);
  return range?.kind === "authored" ? source.syntax.getSourceText(source.syntax.getSourceFile(node)).slice(range.start, range.end) : undefined;
}

function convertedUses(source, program, nodes) {
  return nodes.flatMap(node => {
    const conversion = program.records.nativeExpression.get(node)?.conversion;
    return conversion === undefined ? [] : [{ node, text: sourceText(source, node), conversion }];
  });
}

test("exact number erasure is a per-use conversion: Q1 int64 uses erase, explicit int64 uses of the same pair keep the box", { timeout: 300_000 }, () => {
  const { program, nodes, source } = compileCsharpRequiredRecordSource(erasureProgram, "js");
  const uses = convertedUses(source, program, nodes);
  const erasures = uses.filter(use => use.conversion.kind === "exact-number-erasure");
  // erased, erasedNegative, erasedComputed, absorbed, assigned, category(original), optional(alias), return produced.
  assert.deepEqual(erasures.map(use => use.text).sort(),
    ["alias", "alias", "computed", "negative", "original", "original", "original", "produced"],
    "every authored erasure use (declaration, alias, computed, optional-absorbing, assignment, argument, return) erases");
  for (const use of erasures) {
    assert.equal(targetTypeRefEquals(use.conversion.input, int64) && targetTypeRefEquals(use.conversion.result, float64), true,
      `${use.text}: the exact int64 → double conversion at the use`);
    assert.equal(use.conversion.conversion.kind === "js-value-box" || use.conversion.conversion.kind === "nullable-map", true,
      `${use.text}: the double result is boxed as a number`);
    assert.equal(program.records.jsValueBoxing.get(use.node, float64) !== undefined, true, `${use.text}: the box plan reads the double`);
    assert.equal(program.records.jsValueBoxing.get(use.node, int64), undefined, `${use.text}: the int64 carrier is never boxed at an erasure use`);
  }
  // Cache isolation: the same native pair (long → TsValue) is classified before (wideFirst) and after (wide) the erasure
  // uses; neither direction lends a classification to the other use.
  for (const name of ["wideFirst", "wide"]) {
    const use = uses.find(use => use.text === name);
    assert.equal(use?.conversion.kind, "js-value-box", `${name}: the explicit int64 keeps its long box (identity admission)`);
    assert.equal(program.records.jsValueBoxing.get(use.node, int64) !== undefined, true, `${name}: the long carrier is boxed`);
    assert.equal(program.records.expressionConversion.get(use.node, int64, csharpTsValueTargetType(), "implicit")?.selection.kind, "js-value-box");
  }
});

test("exact number erasure executes: erased values are numbers, explicit int64 stays bigint, producers stay int64", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: erasureProgram });
  assertCsharpCompilationSucceeded(compiled);
  const output = emitted(compiled);
  assert.match(output, /\(double\)/u, "the erasure is an exact native conversion at the use");
  assert.doesNotMatch(output, /IntegerConversions|CastDynamic/u, "no runtime exactness guard and no dynamic conversion (cost control)");
  executeCsharpConstruction(compiled, "number-erasure-positive");
});

test("each erased operand is evaluated exactly once, in its authored argument order", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
let trace = "";
function tick(label: string): string { trace += label; return label; }
function record(first: string, value: unknown, last: string): string { return first + typeof value + last; }
export function run(): boolean {
  const original = 1152921504606846976;
  const result = record(tick("a"), original, tick("b"));
  return result === "anumberb" && trace === "ab";
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "number-erasure-evaluation-order");
});

for (const surface of [undefined, "js"]) {
  for (const [name, body, site] of [
    ["inexact 2^53 + 1", "const original = 9007199254740993; const erased: unknown = original; return erased;", "original"],
    ["inexact negative", "const original = -9007199254740993; const erased: unknown = original; return erased;", "original"],
    ["nonconstant", "let original = 1; original += 1; const erased: unknown = original; return erased;", "original"],
  ]) {
    test(`${name} number erasure is the forwarded Host refusal (${surface ?? "native"})`, { timeout: 300_000 }, () => {
      const compiled = compileEffectiveSource(surface, `export function f(): unknown { ${body} }`);
      assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_NUMBER_ERASURE_INEXACT", site);
    });
  }
}

// The reader authenticates the exact Host admission; it decides nothing itself.
const use = Object.freeze({ id: "use" });
const declaration = Object.freeze({ id: "slot" });
const origin = Object.freeze({ id: "origin" });
const int64Descriptor = Object.freeze({ kind: "primitive", primitive: "int64" });
const unknownDescriptor = Object.freeze({ kind: "intrinsic", intrinsic: "unknown" });
const float64Descriptor = Object.freeze({ kind: "primitive", primitive: "float64" });
function stubFacts({ admission, slot, value, has = () => true,
  contextual = Object.freeze({ kind: "resolved", type: unknownDescriptor }), destination = csharpTsValueTargetType() }) {
  return { facts: { values: {
    admission: () => { if (admission === undefined) throw new Error("no Host slot admission at this use"); return admission; },
    contextual: () => contextual, slot: () => slot, type: () => value, has,
  } }, represent: () => destination };
}
const slotOutcome = Object.freeze({ kind: "slot", slot: declaration, type: unknownDescriptor, broad: true, authority: "declared" });
const valueOutcome = Object.freeze({ kind: "resolved", type: int64Descriptor });
const admitted = conversion => Object.freeze({ kind: "admitted", use, slot: declaration, value: int64Descriptor,
  destination: unknownDescriptor, permission: "widening", conversion: Object.freeze(conversion) });

test("the erasure reader requires the exact, frozen Host admission of the same occurrence", () => {
  const exact = readCsharpNumberErasure(stubFacts({ admission: admitted({ kind: "exact-number-erasure", origin, result: float64Descriptor }),
    slot: slotOutcome, value: valueOutcome }), use, int64, csharpTsValueTargetType(), "implicit");
  assert.equal(exact?.use === use && exact.origin === origin && targetTypeRefEquals(exact.result, float64), true);
  assert.equal(readCsharpNumberErasure(stubFacts({ admission: admitted({ kind: "identity" }), slot: slotOutcome, value: valueOutcome }),
    use, int64, csharpObjectTargetType(), "implicit"), undefined, "identity admission (explicit int64) keeps the box");
  assert.equal(readCsharpNumberErasure(stubFacts({}), use, float64, csharpTsValueTargetType(), "implicit"), undefined,
    "a non-int64 carrier is no erasure candidate and reads no admission");
  assert.equal(readCsharpNumberErasure(stubFacts({}), use, int64, csharpTsValueTargetType(), "explicit"), undefined);
  assert.equal(readCsharpNumberErasure(stubFacts({ contextual: undefined }), use, int64, csharpTsValueTargetType(), "implicit"), undefined,
    "a use with no Host destination (an operation operand) flows into no slot and has no admission to read");
  assert.equal(readCsharpNumberErasure(stubFacts({ destination: int64 }), use, int64, csharpTsValueTargetType(), "implicit"), undefined,
    "a Host destination that is not broad (a generic binder instantiated broad in C#) has no slot admission");
  assert.throws(() => readCsharpNumberErasure(stubFacts({}), use, int64, csharpTsValueTargetType(), "implicit"),
    /no Host slot admission/u, "a missing admission at a broad use is an invariant failure");
  const foreign = Object.freeze({ ...admitted({ kind: "identity" }), use: Object.freeze({ id: "other" }) });
  assert.throws(() => readCsharpNumberErasure(stubFacts({ admission: foreign, slot: slotOutcome, value: valueOutcome }),
    use, int64, csharpTsValueTargetType(), "implicit"), /another occurrence/u);
  const refused = Object.freeze({ kind: "refused", use, slot: declaration, refusal: Object.freeze({ kind: "refused" }) });
  assert.throws(() => readCsharpNumberErasure(stubFacts({ admission: refused, slot: slotOutcome, value: valueOutcome }),
    use, int64, csharpTsValueTargetType(), "implicit"), /refused Host slot admission/u);
  const otherSlot = Object.freeze({ ...slotOutcome, type: Object.freeze({ kind: "intrinsic", intrinsic: "unknown" }) });
  assert.throws(() => readCsharpNumberErasure(stubFacts({ admission: admitted({ kind: "identity" }), slot: otherSlot, value: valueOutcome }),
    use, int64, csharpTsValueTargetType(), "implicit"), /broad declared slot/u, "the destination must be the slot's published descriptor");
  assert.throws(() => readCsharpNumberErasure(stubFacts({ admission: admitted({ kind: "identity" }), slot: slotOutcome,
    value: Object.freeze({ kind: "resolved", type: float64Descriptor }) }), use, int64, csharpTsValueTargetType(), "implicit"),
  /published value of the same occurrence/u);
  assert.throws(() => readCsharpNumberErasure(stubFacts({ admission: admitted({ kind: "exact-number-erasure", origin,
    result: Object.freeze({ kind: "primitive", primitive: "float32" }) }), slot: slotOutcome, value: valueOutcome }),
  use, int64, csharpTsValueTargetType(), "implicit"), /float64 result/u, "no target width chooser: only the Host float64 result");
});
