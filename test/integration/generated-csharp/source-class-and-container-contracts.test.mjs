import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("lambda parameter adaptation rejects an unproved implicit narrowing", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
export function run(): uint8[] { return Array.from("abc", (part: string, index: uint8): uint8 => index); }
` });
  assert(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_LAMBDA_PARAMETER_TYPE_CONFLICT"));
  assert.equal(compiled.result.artifacts.length, 0);
});

test("unrelated class unions preserve cross-file method dispatch and object aliasing", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: {
    "backing.ts": `
      export class TextBacking {
        value: string;
        constructor(value: string) { this.value = value; }
        read(): string { return this.value; }
        change(value: string): void { this.value = value; }
      }
      export class OtherBacking {
        value: string;
        extra: boolean = true;
        constructor(value: string) { this.value = value; }
        read(): string { return this.value; }
        change(value: string): void { this.value = value; }
      }
      export class Wrapper {
        backing: TextBacking | OtherBacking;
        constructor(backing: TextBacking | OtherBacking) { this.backing = backing; }
        read(): string { return this.backing.read(); }
        change(value: string): void { this.backing.change(value); }
      }
      export function retain(backing: OtherBacking | TextBacking): TextBacking | OtherBacking { return backing; }
    `,
  }, sourceText: `
    import { TextBacking, OtherBacking, Wrapper, retain } from "./backing.js";
    export function run(): boolean {
      const first = new TextBacking("first");
      const second = new OtherBacking("second");
      const left = new Wrapper(retain(first));
      const right = new Wrapper(retain(second));
      const initial = left.read() === "first" && right.read() === "second";
      left.change("changed");
      return initial && left.read() === "changed" && first.read() === "changed" && second.read() === "second";
    }
  ` }), "inferred-class-union");
});

test("generic class unions retain optional pointer results, exceptions and call evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({
    surface: "js",
    files: { "backing.ts": `
import type { Pointer, uint8 } from "@tsonic/core/types.js";
import { loadPointer } from "@tsonic/core/lang.js";
export class OptionalBacking {
  value: Pointer<uint8>;
  constructor(value: Pointer<uint8>) { this.value = value; }
  read(absent: boolean): Pointer<uint8> | undefined {
    if (absent) return undefined;
    return this.value;
  }
}
export class RequiredBacking {
  value: Pointer<uint8>;
  extra: boolean = true;
  constructor(value: Pointer<uint8>) { this.value = value; }
  read(fail: boolean): Pointer<uint8> {
    if (fail) throw new Error("selected branch");
    return this.value;
  }
}
export class GenericBacking<T> {
  value: T;
  constructor(value: T) { this.value = value; }
  read(fail: boolean): T {
    if (fail) throw new Error("generic branch");
    return this.value;
  }
}
export type Backing = RequiredBacking | GenericBacking<Pointer<uint8>> | OptionalBacking;
export function read(backing: Backing, fail: boolean): uint8 {
  const pointer = backing.read(fail);
  if (pointer === undefined) return 0;
  return loadPointer(pointer);
}
export class Calls {
  order: string = "";
  source(value: Backing): Backing { this.order += "receiver"; return value; }
  argument(): boolean { this.order += "argument"; return false; }
}
export function evaluate(calls: Calls, value: Backing): uint8 {
  const pointer = calls.source(value).read(calls.argument());
  if (pointer === undefined) return 0;
  return loadPointer(pointer);
}
` },
    sourceText: `
import type { Pointer, uint8 } from "@tsonic/core/types.js";
import { allocatePointer, storePointer } from "@tsonic/core/lang.js";
import { OptionalBacking, RequiredBacking, GenericBacking, Calls, evaluate, read } from "./backing.js";

export function run(): boolean {
  const byte: uint8 = 29;
  const pointer = allocatePointer<uint8>(byte);
  const first = new OptionalBacking(pointer);
  const second = new RequiredBacking(pointer);
  const third = new GenericBacking<Pointer<uint8>>(pointer);
  const initial = read(first, false) === 29 && read(second, false) === 29 && read(third, false) === 29 && read(first, true) === 0;
  storePointer(pointer, 31);
  const retained = read(first, false) === 31 && read(second, false) === 31 && read(third, false) === 31;
  let caught = false;
  try { read(second, true); } catch { caught = true; }
  const calls = new Calls();
  const ordered = evaluate(calls, third) === 31 && calls.order === "receiverargument";
  return initial && retained && caught && ordered;
}
`,
  }), "generic-class-union");
});

test("BigInt construction preserves native integer widths and closed numeric unions", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: {
    "values.ts": `
      export function exact(value: number | bigint): bigint { return BigInt(value); }
      export function numberValue(value: number | bigint): number { return Number(value); }
    `,
  }, sourceText: `
    import type { int64, uint64, int128 } from "@tsonic/core/types.js";
    import { exact, numberValue } from "./values.js";
    function convert(value: number): bigint { return BigInt(value); }
    export function run(): boolean {
      const signed: int64 = -9007199254740993n;
      const unsigned: uint64 = 9007199254740993n;
      const wide: int128 = 170141183460469231731687303715884105727n;
      let rejected = false;
      try { convert(1.5); } catch { rejected = true; }
      return rejected && BigInt(signed) === -9007199254740993n &&
        BigInt(unsigned) === 9007199254740993n &&
        BigInt(wide) === 170141183460469231731687303715884105727n &&
        convert(-42) === -42n && globalThis.BigInt(9007199254740993n) === 9007199254740993n &&
        BigInt(true) === 1n && BigInt(false) === 0n && BigInt("0xff") === 255n &&
        exact(9007199254740993n) === 9007199254740993n && exact(2) === 2n &&
        numberValue(9007199254740993n) === 9007199254740992 && numberValue(2) === 2;
    }
  ` }), "bigint-construction");
});

test("length constructors initialize elements and generic fill preserves token identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    function filled<T>(length: number, value: T): T[] { return new Array<T>(length).fill(value); }
    function retain(token: object): object { return token; }
    export function run(): boolean {
      const first: object = {};
      const alias = retain(first);
      if (Object.isFrozen(alias)) return false;
      const frozen = Object.freeze(first);
      const second: object = Object.freeze({});
      const tokens = new Set<object>();
      tokens.add(first);
      const slots = new Array<object>(3);
      let visits = 0;
      slots.forEach(() => { visits += 1; });
      if (visits !== 3 || slots.length !== 3) return false;
      slots.fill(first);
      const generic = filled(2, second);
      const empty = new Array<number>(0);
      const items = new Array<number>(3, 4);
      const single = Array.of<number>(3);
      const called = Array<number>(2);
      const integer: int64 = 3n;
      const integerItems = new Array<int64>(integer);
      let rejected = false;
      try { new Array<object>(1.5); } catch { rejected = true; }
      return rejected && frozen === alias && Object.isFrozen(alias) && second !== first &&
        tokens.has(alias) && !tokens.has(second) && slots[0] === alias && slots[2] === alias &&
        generic[0] === second && generic[1] === second && empty.length === 0 &&
        items.length === 2 && single.length === 1 && called.length === 2 &&
        integerItems.length === 1 && integerItems[0] === integer;
    }
  ` }), "array-token-construction");
});

test("same-spelled local functions and object members remain ordinary source", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function BigInt(value: number): number { return value + 1; }
    const Object = { freeze(value: number): number { return value + 2; } };
    export function run(): boolean { return BigInt(4) === 5 && Object.freeze(4) === 6; }
  ` });
  executeCsharpConstruction(compiled, "construction-shadows");
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /BigIntOps|EmptyObject\.Freeze/u);
});

test("stored Error throws preserve identity across parameters, return values and rethrows", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
    function fail(error: Error): void { throw error; }
    function create(): Error { return new Error("returned"); }
    export function run(): boolean {
      const original = new Error("stored");
      const before = original.stack;
      let caught = 0;
      let cleaned = 0;
      try { throw original; } catch (error) {
        if (error instanceof Error && error === original && error.message === "stored") caught += 1;
      }
      try { fail(original); } catch (error) { if (error === original) caught += 1; }
      try { throw create(); } catch (error) {
        if (error instanceof Error && error.message === "returned") caught += 1;
      }
      try {
        try { fail(original); } catch (error) { throw error; }
        finally { cleaned += 1; }
      } catch (error) { if (error === original) caught += 1; }
      const subtype = new RangeError("bounds");
      try { fail(subtype); } catch (error) { if (error === subtype) caught += 1; }
      return caught === 5 && cleaned === 1 && original.stack === before;
    }
  ` }), "stored-error-transport");
});

test("open objects cannot silently use a closed frozen carrier", () => {
  for (const sourceText of [
    `function freeze(value: object): object { return Object.freeze(value); } export function example(): object { return freeze({ count: 1 }); }`,
  ]) {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert(compiled.extensionDiagnostics.length + compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.artifacts.size, 0);
  }
});

test("generic object aliases retain exact pointer and byte arguments across nullable transport", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
    import type { Pointer, uint8 } from "@tsonic/core/types.js";
    import { allocatePointer, loadPointer, storePointer } from "@tsonic/core/lang.js";
    type Region<Element> = { readonly kind: "value"; readonly value: Element }
      | { readonly kind: "pointer"; readonly at: () => Pointer<Element> };
    function retain<Item>(region: Region<Item> | undefined): Region<Item> | undefined { return region; }
    function read(region: Region<uint8> | undefined): uint8 {
      if (region === undefined) return 0;
      if (region.kind === "value") return region.value;
      return loadPointer(region.at());
    }
    function nested<Value>(value: Value): () => () => Value { return () => () => value; }
    export function run(): boolean {
      const byte: uint8 = 29;
      const pointer = allocatePointer<uint8>(byte);
      const first: Region<uint8> = { kind: "value", value: byte };
      const second: Region<uint8> = { kind: "pointer", at: () => pointer };
      const callback = nested("retained")();
      const inline = retain({ kind: "pointer", at: () => pointer });
      storePointer(pointer, 31);
      return read(retain(first)) === byte && read(retain(second)) === 31 &&
        read(inline) === 31 && read(retain<uint8>(undefined)) === 0 && callback() === "retained" && callback() === "retained";
    }
  ` }), "generic-pointer-region");
});

test("structural utilities do not materialize opaque marker declarations", () => {
  for (const type of ["Readonly<RawPointer>", "Pick<RawPointer, keyof RawPointer>"]) {
    const result = compileCsharpSource({ sourceText: `
      import type { RawPointer } from "@tsonic/core/types.js";
      export function pass(value: ${type}): ${type} { return value; }
    ` });
    assert.equal(result.sourceDiagnosticsText, "");
    assert.deepEqual(result.extensionDiagnostics, []);
    assert(result.targetDiagnostics.length > 0);
    assert(result.targetDiagnostics.every(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST"));
    assert.equal(result.artifacts.size, 0);
  }
});
