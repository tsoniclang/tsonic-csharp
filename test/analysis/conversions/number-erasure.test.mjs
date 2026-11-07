import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileEffectiveSource, assertPublishedRefusal } from "../../helpers/source-effective-types.mjs";
import { csharpSourcePrimitiveTargetType, csharpTsValueTargetType, csharpObjectTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { readCsharpNumberErasure } from "../../../dist/analysis/conversions/number-erasure.js";

// Basis: N3′ (PLAN §10), WP0 A3, 03-DATA-MODEL E23 limits (C-2499, K-2621); the C# consumer of the Host
// `values.admission(use)` (K-2671) over the one Host destination domain (K-2678, K-2679, D4). A Q1 int64 of number
// origin admitted into unknown with `exact-number-erasure` is converted exactly to double at that use and boxed as a
// number; the int64 producer and read stay intact. An explicitly authored int64 (`identity`) keeps its long box.
// Inexact and nonconstant values are Host refusals, forwarded. Both profiles: Native (surface undefined) and JS.

const surfaces = [undefined, "js"];
const profile = surface => surface ?? "native";
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

// Use forms the Host reaches through the use's association component (K-2678): call argument, rest elements, an
// instantiated generic parameter, an array element and an object property. The arithmetic operand has no Host
// destination and is outside the domain.
const useFormProgram = `
function take(value: unknown): string { return typeof value; }
function many(...values: unknown[]): string { return typeof values[0] + typeof values[1]; }
function generic<T>(value: T): string { return typeof value; }
export function run(): boolean {
  const original = 1152921504606846976;
  const array: unknown[] = [original];
  const object: { field: unknown } = { field: original };
  return take(original) === "number" && many(original, original) === "numbernumber" &&
    generic<unknown>(original) === "number" && typeof array[0] === "number" && typeof object.field === "number" &&
    original - 1152921504606846975 === 1;
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

// The same use, one Host destination: values.destination names the broad slot of the admission, and its type,
// admission.destination and slot(admission.slot).type are the identical published descriptor (K-2683).
function assertOneDestination(source, use, label) {
  const { values } = source.facts;
  const destination = values.destination(use.node);
  const admission = values.admission(use.node);
  assert.equal(admission.kind === "admitted" && admission.use === use.node, true, `${label}: the Host admission of this occurrence`);
  const slot = values.slot(admission.slot);
  assert.equal(destination !== undefined && destination.kind === "slot" && destination.broad &&
    destination.slot === admission.slot && destination.type === admission.destination, true,
    `${label}: values.destination is the admission's broad slot and destination`);
  assert.equal(slot.kind === "slot" && slot.broad && slot.slot === admission.slot && slot.type === admission.destination, true,
    `${label}: the admission slot is the same broad published slot`);
}

function assertErasureRecord(program, use, label) {
  assert.equal(targetTypeRefEquals(use.conversion.input, int64) && targetTypeRefEquals(use.conversion.result, float64), true,
    `${label}: the exact int64 → double conversion at the use`);
  assert.equal(use.conversion.conversion.kind === "js-value-box" || use.conversion.conversion.kind === "nullable-map", true,
    `${label}: the double result is boxed as a number`);
  assert.equal(program.records.jsValueBoxing.get(use.node, float64) !== undefined, true, `${label}: the box plan reads the double`);
  assert.equal(program.records.jsValueBoxing.get(use.node, int64), undefined, `${label}: the int64 carrier is never boxed at an erasure use`);
}

for (const surface of surfaces) {
  test(`exact number erasure is a per-use conversion: Q1 int64 uses erase, explicit int64 uses of the same pair keep the box (${profile(surface)})`, { timeout: 300_000 }, () => {
    const { program, nodes, source } = compileCsharpRequiredRecordSource(erasureProgram, surface);
    const uses = convertedUses(source, program, nodes);
    const erasures = uses.filter(use => use.conversion.kind === "exact-number-erasure");
    // erased, erasedNegative, erasedComputed, absorbed, assigned, category(original), optional(alias), return produced.
    assert.deepEqual(erasures.map(use => use.text).sort(),
      ["alias", "alias", "computed", "negative", "original", "original", "original", "produced"],
      "every authored erasure use (declaration, alias, computed, optional-absorbing, assignment, argument, return) erases");
    for (const use of erasures) {
      assertErasureRecord(program, use, use.text);
      assertOneDestination(source, use, use.text);
    }
    // Cache isolation: the same native pair (long → TsValue) is classified before (wideFirst) and after (wide) the erasure
    // uses; neither direction lends a classification to the other use.
    for (const name of ["wideFirst", "wide"]) {
      const use = uses.find(use => use.text === name);
      assert.equal(use?.conversion.kind, "js-value-box", `${name}: the explicit int64 keeps its long box (identity admission)`);
      assert.equal(program.records.jsValueBoxing.get(use.node, int64) !== undefined, true, `${name}: the long carrier is boxed`);
      assert.equal(program.records.expressionConversion.get(use.node, int64, csharpTsValueTargetType(), "implicit")?.selection.kind, "js-value-box");
      const admission = source.facts.values.admission(use.node);
      assert.equal(admission.kind === "admitted" && admission.conversion.kind === "identity", true, `${name}: the Host admits identity`);
    }
  });

  test(`exact number erasure executes: erased values are numbers, explicit int64 stays bigint, producers stay int64 (${profile(surface)})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: erasureProgram });
    assertCsharpCompilationSucceeded(compiled);
    const output = emitted(compiled);
    assert.match(output, /\(double\)/u, "the erasure is an exact native conversion at the use");
    // Structural cost control only: no runtime exactness guard and no dynamic conversion. Measured allocation and cost
    // evidence is not claimed here (open, see AGENT-D4-NOTES.md).
    assert.doesNotMatch(output, /IntegerConversions|CastDynamic/u, "no runtime exactness guard and no dynamic conversion");
    executeCsharpConstruction(compiled, `number-erasure-positive-${profile(surface)}`);
  });

  test(`each erased operand is evaluated exactly once, in its authored argument order (${profile(surface)})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
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
    executeCsharpConstruction(compiled, `number-erasure-evaluation-order-${profile(surface)}`);
  });

  test(`argument, rest, generic, array element and property uses erase through their one Host destination (${profile(surface)})`, { timeout: 300_000 }, () => {
    const { program, nodes, source } = compileCsharpRequiredRecordSource(useFormProgram, surface);
    const uses = convertedUses(source, program, nodes).filter(use => use.text === "original");
    const erasures = uses.filter(use => use.conversion.kind === "exact-number-erasure");
    // take, many ×2, generic, array element, property; the arithmetic operand has no Host destination.
    assert.equal(erasures.length, 6, `the six destination uses erase: ${uses.map(use => use.conversion.kind).join(", ")}`);
    for (const [index, use] of erasures.entries()) {
      assertErasureRecord(program, use, `use ${index}`);
      assertOneDestination(source, use, `use ${index}`);
    }
    const compiled = compileCsharpSource({ surface, sourceText: useFormProgram });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch(emitted(compiled), /IntegerConversions|CastDynamic/u);
    executeCsharpConstruction(compiled, `number-erasure-use-forms-${profile(surface)}`);
  });

  for (const [name, body, site] of [
    ["inexact 2^53 + 1", "const original = 9007199254740993; const erased: unknown = original; return erased;", "original"],
    ["inexact negative", "const original = -9007199254740993; const erased: unknown = original; return erased;", "original"],
    ["nonconstant", "let original = 1; original += 1; const erased: unknown = original; return erased;", "original"],
  ]) {
    test(`${name} number erasure is the forwarded Host refusal (${profile(surface)})`, { timeout: 300_000 }, () => {
      const compiled = compileEffectiveSource(surface, `export function f(): unknown { ${body} }`);
      assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_NUMBER_ERASURE_INEXACT", site);
    });
  }
}

// The reader authenticates the exact Host admission inside the Host destination domain; it decides nothing itself.
const use = Object.freeze({ id: "use" });
const declaration = Object.freeze({ id: "slot" });
const origin = Object.freeze({ id: "origin" });
const int64Descriptor = Object.freeze({ kind: "primitive", primitive: "int64" });
const unknownDescriptor = Object.freeze({ kind: "intrinsic", intrinsic: "unknown" });
const float64Descriptor = Object.freeze({ kind: "primitive", primitive: "float64" });
const broadDestination = Object.freeze({ kind: "slot", slot: declaration, type: unknownDescriptor, broad: true });
// `hostDestination` omitted: the default broad Host destination (values.destination). `hostDestination: undefined`
// given: the use deliberately has no Host destination. The two are told apart by the presence of the key, never by its
// value (K-2679). `destination` is the C# representation of the Host destination.
function stubFacts(options) {
  const { admission, slot, value, has = () => true, destination = csharpTsValueTargetType() } = options;
  const hostDestination = Object.hasOwn(options, "hostDestination") ? options.hostDestination : broadDestination;
  const reads = { admission: 0, represent: 0 };
  const host = { facts: { values: {
    admission: () => {
      reads.admission += 1;
      if (admission === undefined) throw new Error("Source value facts: no Host slot admission at this use, although its Host destination is a broad slot.");
      return admission;
    },
    destination: () => hostDestination, slot: () => slot, type: () => value, has,
  } }, represent: () => { reads.represent += 1; return destination; } };
  return { host, reads };
}
const read = (options, source = int64, target = csharpTsValueTargetType(), mode = "implicit") => {
  const stub = stubFacts(options);
  return { result: readCsharpNumberErasure(stub.host, use, source, target, mode), reads: stub.reads };
};
const readThrows = (options, pattern, message, source = int64, target = csharpTsValueTargetType()) =>
  assert.throws(() => readCsharpNumberErasure(stubFacts(options).host, use, source, target, "implicit"), pattern, message);
const slotOutcome = Object.freeze({ kind: "slot", slot: declaration, type: unknownDescriptor, broad: true, authority: "declared" });
const valueOutcome = Object.freeze({ kind: "resolved", type: int64Descriptor });
const admitted = conversion => Object.freeze({ kind: "admitted", use, slot: declaration, value: int64Descriptor,
  destination: unknownDescriptor, permission: "widening", conversion: Object.freeze(conversion) });
const exactErasure = admitted({ kind: "exact-number-erasure", origin, result: float64Descriptor });

test("the erasure reader requires the exact, frozen Host admission of the same occurrence", () => {
  const exact = read({ admission: exactErasure, slot: slotOutcome, value: valueOutcome }).result;
  assert.equal(exact?.use === use && exact.origin === origin && targetTypeRefEquals(exact.result, float64), true);
  assert.equal(read({ admission: admitted({ kind: "identity" }), slot: slotOutcome, value: valueOutcome },
    int64, csharpObjectTargetType()).result, undefined, "identity admission (explicit int64, or any) keeps the box");
  const candidateless = read({}, float64);
  assert.equal(candidateless.result === undefined && candidateless.reads.admission === 0, true,
    "a non-int64 carrier is no erasure candidate and reads no admission");
  const explicit = read({}, int64, csharpTsValueTargetType(), "explicit");
  assert.equal(explicit.result === undefined && explicit.reads.admission === 0, true);
  const foreign = Object.freeze({ ...admitted({ kind: "identity" }), use: Object.freeze({ id: "other" }) });
  readThrows({ admission: foreign, slot: slotOutcome, value: valueOutcome }, /another occurrence/u);
  readThrows({ admission: admitted({ kind: "identity" }), slot: slotOutcome, value: Object.freeze({ kind: "resolved", type: float64Descriptor }) },
    /published value of the same occurrence/u);
  readThrows({ admission: admitted({ kind: "exact-number-erasure", origin, result: Object.freeze({ kind: "primitive", primitive: "float32" }) }),
    slot: slotOutcome, value: valueOutcome }, /float64 result/u, "no target width chooser: only the Host float64 result");
});

test("the Host destination domain: no destination reads no admission; inside it, missing evidence is an invariant (K-2678, K-2679)", () => {
  // Deliberately absent (the key is given): an operation operand or a target-internal box. No admission is read.
  const absent = read({ hostDestination: undefined });
  assert.equal(absent.result === undefined && absent.reads.admission === 0 && absent.reads.represent === 0, true,
    "a use with no Host destination flows into no slot and has no admission to read");
  // K-2683: a non-broad Host destination (identity(original) into T, a string slot) is outside the A3 domain. The stub
  // throws on any admission read, so a read here would fail: no read, no erasure, no invariant.
  const narrow = read({ hostDestination: Object.freeze({ ...broadDestination, broad: false }) });
  assert.equal(narrow.result === undefined && narrow.reads.admission === 0 && narrow.reads.represent === 0, true,
    "a non-broad Host destination reads no admission, erases nothing and raises no invariant");
  const narrowObject = read({ hostDestination: Object.freeze({ ...broadDestination, broad: false }) }, int64, csharpObjectTargetType());
  assert.equal(narrowObject.result === undefined && narrowObject.reads.admission === 0, true,
    "broadness is the Host's destination.broad, never the broad C# carrier of the conversion");
  // Omitted (the default broad destination): the same call reads the admission, and its absence is an invariant.
  readThrows({}, /no Host slot admission/u, "a missing admission at an authoritative broad destination is an invariant failure");
  // The destination decides the domain, not the C# carriers: an int64 boxed into System.Object inside the domain reads it.
  readThrows({}, /no Host slot admission/u, "System.Object carriers ask the same Host domain", int64, csharpObjectTargetType());
});

test("refused or failed evidence inside the domain is an invariant, never 'no erasure' (R5, I4)", () => {
  readThrows({ hostDestination: Object.freeze({ kind: "refused", code: "TSONIC_LOCAL_TYPE_UNSUPPORTED", site: use }) },
    /refused Host destination/u, "a late Host refusal of the destination is not a non-slot use");
  const refused = Object.freeze({ kind: "refused", use, slot: declaration, refusal: Object.freeze({ kind: "refused" }) });
  readThrows({ admission: refused, slot: slotOutcome, value: valueOutcome }, /refused Host slot admission/u);
  readThrows({ admission: exactErasure, slot: slotOutcome, value: valueOutcome,
    destination: Object.freeze({ kind: "csharp-refused", code: "CSHARP_TEST", message: "test", site: use }) },
  /failed mapping does not waive its admission/u, "a failed representation is no evidence that the A3 obligation is absent");
  readThrows({ admission: exactErasure, slot: slotOutcome, value: valueOutcome, destination: int64 },
    /disagrees with the broad carrier/u, "a broad Host destination whose C# carrier is not broad is conflicting evidence");
});

test("the Host destination and the admission of one use name the same broad slot and published descriptor", () => {
  const equalButOther = Object.freeze({ kind: "intrinsic", intrinsic: "unknown" });
  readThrows({ admission: exactErasure, slot: slotOutcome, value: valueOutcome,
    hostDestination: Object.freeze({ ...broadDestination, type: equalButOther }) },
  /same broad slot and published descriptor/u, "values.destination must publish the admission's destination object");
  readThrows({ admission: exactErasure, slot: slotOutcome, value: valueOutcome,
    hostDestination: Object.freeze({ ...broadDestination, slot: Object.freeze({ id: "other slot" }) }) },
  /same broad slot and published descriptor/u, "the admission must belong to the destination's own slot");
});
