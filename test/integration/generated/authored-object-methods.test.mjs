import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { authoredObjectMethodEvidenceSource } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";

for (const surface of [undefined, "js"]) {
  test(`authored ordinary methods retain their exact body and shared captures (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: authoredObjectMethodEvidenceSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `authored-object-methods-${surface ?? "native"}`);
  });
}

const mutableMethodSources = [
  ["first-class write-consuming native formals", `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read(): int32; }
function read(owner: Reader): int32 { return owner.read(); }
function replace(owner: Reader): void { owner.read = (): int32 => 3; }
export function run(): boolean {
  const fixed = { read(): int32 { return 1; } };
  const changed = { read(): int32 { return 2; } };
  const change = replace;
  const before = changed.read;
  change(changed);
  return read(fixed) === 1 && read(changed) === 3 && before() === 2;
}
`],
  ["concrete literal receiver fields", `
import type { int32 } from "@tsonic/core/types.js";
export function run(): boolean {
  const owner = { read(): int32 { return 1; } };
  const container = { owner };
  const original = owner.read;
  container.owner.read = (): int32 => 3;
  const saved = container.owner.read;
  container.owner.read = (): int32 => 4;
  return original() === 1 && saved() === 3 && owner.read() === 4;
}
`],
  ["closed body snapshots", `
import type { int32 } from "@tsonic/core/types.js";
let captured: int32 = 1;
function make(count: int32) {
  return { count, read(): int32 { return this.count + captured; } };
}
export function run(): boolean {
  const value = make(7);
  const alias = value;
  const first = value.read;
  const second = alias.read;
  const copied = { read: first };
  alias.read = value.read;
  const sameValue = value.read;
  value.count = 9;
  captured = 2;
  const replacement = (): int32 => 17;
  alias.read = replacement;
  const replaced = value.read;
  alias.read = (): int32 => 23;
  return first === second && sameValue === first && first() === 11 && copied.read() === 11 &&
    replaced === replacement && replaced() === 17 && value.read() === 23;
}
`],
  ["generic original body snapshots", `
import type { int32 } from "@tsonic/core/types.js";
function make(step: int32) {
  return { calls: 0 as int32, choose<Value>(value: Value): Value { this.calls += step; return value; } };
}
export function run(): boolean {
  const value = make(1);
  const other = make(10);
  const first = value.choose;
  const second = value.choose;
  const copied = first;
  value.choose = other.choose;
  const originalResult = first<int32>(3);
  const currentResult = value.choose<int32>(4);
  const copiedResult = copied<string>("kept");
  return first === second && originalResult === 3 && currentResult === 4 && copiedResult === "kept" &&
    value.calls === 2 && other.calls === 10;
}
`],
  ["optional written absence", `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read?<Value>(value: Value): Value; }
let effects: int32 = 0;
function argument(): int32 { effects += 1; return 7; }
function clear(owner: Reader): void { owner.read = undefined; }
export function run(): boolean {
  const owner: Reader = { read<Value>(value: Value): Value { return value; } };
  const first = owner.read;
  const second = owner.read;
  if (first === undefined || second === undefined) return false;
  clear(owner);
  const absent = owner.read?.(argument());
  const retained = first<int32>(11);
  const stillAbsent = owner.read;
  owner.read = first;
  const restored = owner.read?.<int32>(13);
  return first === second && absent === undefined && stillAbsent === undefined && effects === 0 &&
    retained === 11 && restored === 13;
}
`],
  ["whole interface dispatch and immutable body values", `
import type { int32 } from "@tsonic/core/types.js";
type Chooser = { choose<Value>(value: Value): Value };
let firstCalls: int32 = 0;
let secondCalls: int32 = 0;
function makeFirst(): Chooser {
  return { choose<Value>(value: Value): Value { firstCalls += 1; return value; } };
}
function makeSecond(): Chooser {
  return { choose<Value>(value: Value): Value { secondCalls += 1; return value; } };
}
function invoke(owner: Chooser): int32 { return owner.choose<int32>(4); }
export function run(): boolean {
  const owner = makeFirst();
  const other = makeSecond();
  const original = owner.choose;
  const repeated = owner.choose;
  owner.choose = other.choose;
  const current = invoke(owner);
  const retained = original<string>("kept");
  owner.choose = original;
  const restored = invoke(owner);
  return original === repeated && current === 4 && retained === "kept" && restored === 4 &&
    firstCalls === 2 && secondCalls === 1;
}
`],
  ["fixed bodies share reads without acquiring peer mutation storage", `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read(): int32; }
function makeFixed() { return { read(): int32 { return 1; } }; }
function makeChanged() { return { read(): int32 { return 2; } }; }
function read(owner: Reader): int32 { return owner.read(); }
function replace(owner: Reader): void { owner.read = (): int32 => 3; }
export function run(): boolean {
  const fixed = makeFixed();
  const changed = makeChanged();
  const beforeFixed = read(fixed);
  const beforeChanged = read(changed);
  replace(changed);
  return beforeFixed === 1 && beforeChanged === 2 && read(fixed) === 1 && read(changed) === 3;
}
`],
  ["generic extraction snapshots the current replacement", `
import type { int32 } from "@tsonic/core/types.js";
function make(step: int32) {
  return { calls: 0 as int32, choose<Value>(value: Value): Value { this.calls += step; return value; } };
}
export function run(): boolean {
  const first = make(1);
  const second = make(3);
  const third = make(4);
  const original = first.choose;
  first.choose = second.choose;
  const saved = first.choose;
  const repeated = first.choose;
  first.choose = third.choose;
  const oldResult = saved<int32>(3);
  const currentResult = first.choose<int32>(4);
  const originalResult = original<int32>(1);
  return saved === repeated && saved === second.choose && saved !== first.choose &&
    oldResult === 3 && currentResult === 4 && originalResult === 1 &&
    first.calls === 1 && second.calls === 3 && third.calls === 4;
}
`],
  ["monomorphic optional protocols retain replacement and named self", `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read?(value: int32): int32; }
function make(): Reader { return { read(value: int32): int32 { return value; } }; }
function replace(owner: Reader, step: int32): void {
  owner.read = function current(value: int32): int32 {
    if (value < 0) return current(value + 1);
    return value + step;
  };
}
function clear(owner: Reader): void { owner.read = undefined; }
export function run(): boolean {
  const owner = make();
  replace(owner, 3);
  const saved = owner.read;
  const repeated = owner.read;
  if (saved === undefined || repeated === undefined) return false;
  replace(owner, 4);
  const current = owner.read;
  if (current === undefined) return false;
  clear(owner);
  return saved === repeated && saved !== current && saved(-1) === 3 && saved(2) === 5 &&
    current(2) === 6 && owner.read === undefined;
}
`],
];

for (const surface of ["native", "js"]) for (const [name, sourceText] of mutableMethodSources) {
  test(`mutable native methods retain ${name} (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const shapes = program.objectShapes.knownShapes().filter(shape => shape.methodImplementation !== undefined);
    const methods = shapes.flatMap(shape => program.records.objectMethods.get(shape) ?? []);
    assert.equal(methods.some(method => method.emission.value.kind !== "fixed"), true,
      "the complete checked native body has a real mutable callable-value owner");
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Func<__TsonicShape_/u.test(source), false,
      "a native body never allocates an open synthetic receiver delegate");
    assert.equal(/dynamic|\.GetType\(/u.test(source), false,
      "the exact stored delegate or protocol never needs dynamic invocation");
    executeCsharpConstruction(compiled, `mutable-authored-${name.replaceAll(" ", "-")}-${surface}`);
  });
}

for (const surface of ["native", "js"]) for (const [name, receiver] of [
  ["interface array element", "values[0]!"],
  ["interface property", "container.owner"],
  ["interface call result", "choose()"],
]) {
  test(`native method writes refuse unresolved ${name} demand (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read(): int32; }
const owner: Reader = { read(): int32 { return 1; } };
const values: Reader[] = [owner];
const container: { owner: Reader } = { owner };
function choose(): Reader { return owner; }
export function run(): int32 { ${receiver}.read = (): int32 => 3; return owner.read(); }
` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the retained program is source-valid before native admission");
    assert.equal(compiled.result.program === undefined, true, "an unresolved source write cannot seal a native contract");
    assert.equal(compiled.targetDiagnostics.length, 1, "one original source-write reason owns the refusal");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_SOURCE_STORAGE_NOT_PROVEN", "the source-storage boundary owns the diagnostic");
    assert.equal(compiled.targetDiagnostics[0].message,
      "Member-write demand requires a parameter binding or a qualified local alias, not an element, property or call result.",
      "the real v1 boundary is stated precisely, not disguised as native impossibility");
    assert.equal(compiled.artifacts.size, 0, "unproved native writes emit no output");
  });
}
