import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeRefLikeFixture } from "../../helpers/native-ref-like-fixture.mjs";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { isCsharpTargetTypeRef, snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { validateDotnetTypeParameters } from "../../../dist/providers/native/model/contract/dotnet-signatures.js";

const imports = `import type { int32 } from "@tsonic/core/types.js";
import { Span } from "@tsonic/dotnet/System.js";`;

for (const [name, body, expected] of [
  ["nullable native ref-like return", `export function fail(): Span<int32> | undefined { return undefined; }`,
    "CSHARP_REFLIKE_GENERIC_ARGUMENT"],
  ["nullable native ref-like initialization", `export function fail(values: int32[]): int32 {
    let view: Span<int32> | undefined = new Span<int32>(values);
    return view === undefined ? 0 : view.Length;
  }`, "CSHARP_REFLIKE_BOXING"],
  ["source generic class", `class Box<Value> { value: Value; constructor(value: Value) { this.value = value; } }
    export function fail(values: int32[]): int32 { return new Box<Span<int32>>(new Span<int32>(values)).value.Length; }`,
    "CSHARP_REFLIKE_GENERIC_ARGUMENT"],
  ["source generic method explicit", `function identity<Value>(value: Value): Value { return value; }
    export function fail(values: int32[]): int32 { return identity<Span<int32>>(new Span<int32>(values)).Length; }`,
    "CSHARP_REFLIKE_GENERIC_ARGUMENT"],
  ["source generic method inferred", `function identity<Value>(value: Value): Value { return value; }
    export function fail(values: int32[]): int32 { return identity(new Span<int32>(values)).Length; }`,
    "CSHARP_REFLIKE_GENERIC_ARGUMENT"],
  ["static module storage", `let view = new Span<int32>([7]); export function fail(): int32 { return view.Length; }`,
    "CSHARP_REFLIKE_MODULE_FIELD"],
  ["ordinary field", `export class Holder { value: Span<int32>; constructor(value: Span<int32>) { this.value = value; } }`,
    "CSHARP_REFLIKE_FIELD"],
  ["ordinary object member", `export function fail(values: int32[]): int32 {
    const holder: { value: Span<int32> } = { value: new Span<int32>(values) }; return holder.value.Length;
  }`, "CSHARP_REFLIKE_FIELD"],
  ["inline ordinary object member", `export function fail(values: int32[]): int32 {
    return ({ value: new Span<int32>(values) }).value.Length;
  }`, "CSHARP_REFLIKE_FIELD"],
  ["ordinary array element", `export function fail(values: Span<int32>[]): int32 { return values.Length; }`,
    "CSHARP_REFLIKE_ARRAY_ELEMENT"],
  ["ordinary tuple element", `export function fail(value: Span<int32>): [Span<int32>, int32] { return [value, 1]; }`,
    "CSHARP_REFLIKE_TUPLE_ELEMENT"],
  ["iterator element", `export function* fail(values: int32[]): Generator<Span<int32>, void, unknown> {
    yield new Span<int32>(values);
  }`, "CSHARP_REFLIKE_ITERATOR_ELEMENT"],
]) {
  test(`native ref-like placement rejects ${name} before publication`, () => {
    const compiled = compileCsharpSource({ sourceText: `${imports}\n${body}` });
    assert.equal(compiled.sourceDiagnosticsText, "", `${name}: checked source reaches the native owner`);
    const codes = compiled.result.diagnostics.map(issue => issue.code);
    assert.equal(codes.includes(expected), true, `${name}: ${JSON.stringify(codes)} requires ${expected}`);
    assert.equal(compiled.result.program === undefined, true, `${name}: no invalid native program`);
    assert.equal(compiled.result.artifacts.length, 0, `${name}: no invalid native artifacts`);
  });
}

test("an inferred ref-like object cannot bypass an earlier exact native carrier refusal", () => {
  const compiled = compileCsharpSource({ sourceText: `${imports}
export function fail(values: int32[]): int32 {
  const holder = { value: new Span<int32>(values) }; return holder.value.Length;
}` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the inferred object is checked source");
  assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message.includes("System.Span") && issue.message.includes("int32") && issue.message.includes("float64")), true,
    "the existing inferred-container numeric mismatch remains an exact early refusal");
  assert.equal(compiled.result.program === undefined, true, "no mismatched native program is published");
  assert.equal(compiled.result.artifacts.length, 0, "no mismatched native source is emitted");
});

test("native named-carrier boundaries require exact immutable generic-slot facts", () => {
  const integer = { kind: "source-primitive", name: "int32" };
  const carrier = csharpTargetNamedType("Proof.Generic", [integer], undefined,
    { allowsRefLikeTypeArguments: [true] });
  assert.equal(isCsharpTargetTypeRef(carrier), true, "actual exact per-slot facts form a valid carrier");
  assert.equal(Object.isFrozen(carrier.csharpAllowsRefLikeTypeArguments), true, "the producer owns immutable slot facts");
  const omitted = { ...carrier };
  delete omitted.csharpAllowsRefLikeTypeArguments;
  for (const [name, invalid] of [
    ["missing", omitted],
    ["non-array", { ...carrier, csharpAllowsRefLikeTypeArguments: { 0: true, length: 1 } }],
    ["arity", { ...carrier, csharpAllowsRefLikeTypeArguments: [] }],
    ["non-boolean", { ...carrier, csharpAllowsRefLikeTypeArguments: [1] }],
    ["sparse", { ...carrier, csharpAllowsRefLikeTypeArguments: new Array(1) }],
  ]) {
    assert.equal(isCsharpTargetTypeRef(invalid), false, `${name}: no permission without complete native metadata`);
    assert.throws(() => snapshotCsharpTargetTypes([invalid]), name === "sparse" ? /bounded dense arrays/u : /bounded valid carriers/u, name);
  }
  assert.throws(() => csharpTargetNamedType("Proof.Generic", [integer], undefined),
    /exact native generic-slot permissions/u, "the removed optional-metadata producer form is rejected");
  assert.throws(() => csharpTargetNamedType("Proof.Generic", [integer], undefined, { allowsRefLikeTypeArguments: [] }),
    /exact native generic-slot permissions/u, "the actual producer enforces exact arity");
  assert.throws(() => csharpTargetNamedType("Proof.Generic", [integer], undefined, { allowsRefLikeTypeArguments: new Array(1) }),
    /exact native generic-slot permissions/u, "a sparse slot array does not prove permission");
});

test("native method and type parameter boundaries require an actual allows-ref-struct boolean", () => {
  for (const [name, metadata, expectedIssues] of [
    ["missing", {}, 1],
    ["undefined", { allowsRefLike: undefined }, 1],
    ["non-boolean", { allowsRefLike: 1 }, 1],
    ["allowed", { allowsRefLike: true }, 0],
    ["ordinary", { allowsRefLike: false }, 0],
  ]) {
    const issues = [];
    validateDotnetTypeParameters([{ identity: "Fixture.Method:0", name: "Value", ...metadata }], "$.parameters",
      { add: (path, message) => issues.push({ path, message }) });
    assert.equal(issues.length, expectedIssues, `${name}: missing metadata cannot become permission or false`);
    if (expectedIssues !== 0) {
      assert.equal(issues[0].path, "$.parameters[0].allowsRefLike", `${name}: the actual absent native fact is named`);
      assert.equal(issues[0].message, "A CLR generic parameter requires its native allows-ref-struct flag.", name);
    }
  }
});

for (const [name, expression] of [
  ["explicit", "Methods.Ordinary<Lease>(new Lease(7))"],
  ["inferred", "Methods.Ordinary(new Lease(7))"],
]) {
  test(`native method generic slots without allows-ref-struct refuse ${name} arguments`, () => {
    const { capability } = nativeRefLikeFixture();
    const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import { Lease, Methods } from "@fixture/ref-like/RefLikeProof.js";
export function fail(): boolean { return ${expression} === 7; }` });
    assert.equal(compiled.sourceDiagnosticsText, "", `${name}: the real selected native method is source-checked`);
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_GENERIC_ARGUMENT"), true,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(compiled.result.program === undefined, true, `${name}: no invalid native generic method is published`);
    assert.equal(compiled.result.artifacts.length, 0, `${name}: no invalid method artifact`);
  });
}

test("native ref-like fields are refused on an inferred reflected object without numeric carrier inference", () => {
  const { capability } = nativeRefLikeFixture();
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import { Lease } from "@fixture/ref-like/RefLikeProof.js";
export function fail(): boolean { const holder = { value: new Lease(7) }; return holder.value.Value === 7; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the reflected inferred object is checked source");
  assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_FIELD"), true,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  assert.equal(compiled.result.program === undefined, true, "the actual physical object cannot store a reflected ref struct");
  assert.equal(compiled.result.artifacts.length, 0, "no native-invalid reflected storage is emitted");
});

test("native method allows-ref-struct anti-constraints preserve actual Span-style borrowing", { timeout: 240_000 }, () => {
  const { capability, project } = nativeRefLikeFixture();
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import { Lease, Methods } from "@fixture/ref-like/RefLikeProof.js";
function identity<Value>(value: Value): Value { return value; }
export function run(): boolean { return Methods.Allowed<Lease>(new Lease(7)) === 7 && Methods.Allowed(new Lease(9)) === 7 && identity(11) === 11; }` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the actual allowed native method is source-checked");
  assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  executeCsharpConstruction(compiled, "native-ref-like-method-anti-constraint", false, false, [project]);
});

test("native ref-like synchronous and allowed delegate carriers stay native", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `${imports}
function apply(callback: (view: Span<int32>) => int32, values: int32[]): int32 {
  return callback(new Span<int32>(values));
}
export function run(): boolean { return apply(view => view.Length, [7, 9]) === 2; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "native delegate source is checked");
  assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  executeCsharpConstruction(compiled, "native-ref-like-allowed-delegate");
});

test("abstract native ref-like properties do not manufacture backing storage", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `${imports}
export abstract class Holder { abstract readonly value: Span<int32>; }
export function size(value: Holder): int32 { return value.value.Length; }
export function run(): boolean { return true; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "abstract property source is checked");
  assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  executeCsharpConstruction(compiled, "native-ref-like-abstract-property");
});

test("native iterator locals consumed before yield do not require retained ref-like state", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `${imports}
export function* values(items: int32[]): Generator<int32, void, unknown> {
  const view = new Span<int32>(items); const length = view.Length; yield length;
}
export function run(): boolean { for (const value of values([7, 9])) return value === 2; return false; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the iterator local is checked source");
  assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  executeCsharpConstruction(compiled, "native-ref-like-pre-yield");
});
