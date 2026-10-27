import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { authoredObjectMethodEvidenceSource } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";

const factorySharedChooserSource = `
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
`;

const mutableMethodSources = [
  ["annotated native write facets preserve concrete aliases", `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read(): int32; }
function read(owner: Reader): int32 { return owner.read(); }
function replace(owner: Reader): void { owner.read = (): int32 => 3; }
export function run(): boolean {
  const fixed: Reader = { read(): int32 { return 1; } };
  const changed: Reader = { read(): int32 { return 2; } };
  const alias = changed;
  const before = changed.read;
  replace(alias);
  return read(fixed) === 1 && read(changed) === 3 && alias === changed && before() === 2;
}
`],
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
  ["whole interface dispatch and immutable body values on concrete local literals", `
import type { int32 } from "@tsonic/core/types.js";
type Chooser = { choose<Value>(value: Value): Value };
let firstCalls: int32 = 0;
let secondCalls: int32 = 0;
function invoke(owner: Chooser): int32 { return owner.choose<int32>(4); }
export function run(): boolean {
  const owner = { choose<Value>(value: Value): Value { firstCalls += 1; return value; } };
  const other = { choose<Value>(value: Value): Value { secondCalls += 1; return value; } };
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
  ["all reaching factory producers retain the same required writable return facet", `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read?(value: int32): int32; }
function make(first: boolean, step: int32): Reader {
  if (first) return { read(value: int32): int32 { return value + step; } };
  return { read(value: int32): int32 { return value - step; } };
}
function replace(owner: Reader, step: int32): void {
  owner.read = (value: int32): int32 => value + step;
}
export function run(): boolean {
  const first = make(true, 1);
  const second = make(false, 2);
  const firstSaved = first.read;
  const secondSaved = second.read;
  if (firstSaved === undefined || secondSaved === undefined) return false;
  replace(first, 10);
  replace(second, 20);
  const firstCurrent = first.read;
  const secondCurrent = second.read;
  if (firstCurrent === undefined || secondCurrent === undefined) return false;
  return firstSaved(3) === 4 && secondSaved(3) === 1 && firstCurrent(3) === 13 &&
    secondCurrent(3) === 23 && firstSaved !== firstCurrent && secondSaved !== secondCurrent;
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

export { factorySharedChooserSource, mutableMethodSources };
