import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { valueStructProofFiles } from "../../../../tsonic/test/fixtures/value-structs.mjs";

function execute(compiled, name, asynchronous = false) {
  assertCsharpCompilationSucceeded(compiled);
  const scratch = fileURLToPath(new URL("../../../.temp/", import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, `${name}-`));
  for (const [path, text] of compiled.artifacts) {
    if (!path.endsWith(".cs")) continue;
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), `if (!(${asynchronous ? "await " : ""}Tsonic.Generated.Index.run())) throw new System.Exception("source construction contract");`);
  const references = [
    join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj"),
    join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj"),
  ];
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup>${references.map(path => `<ProjectReference Include="${path}" />`).join("")}</ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
}

for (const surface of [undefined, "js"]) {
  test(`shared value-struct storage and location contract executes in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: valueStructProofFiles["index.ts"],
      files: { "records.ts": valueStructProofFiles["records.ts"] } }), `value-struct-${surface ?? "native"}`);
  });
}

test("void results retain unit calls, nullable conversion and equality effects", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
let visits = 0;
function value(): number { visits += 1; return visits; }
function unit(): void { visits += 1; }
function optional(value: number | undefined): boolean { return value === undefined; }
function compare(value: number | undefined): boolean { return value === void unit(); }
export function run(): boolean {
  return String(void value()) === "undefined" && String(void unit()) === "undefined" &&
    optional(void value()) && optional(void unit()) && compare(undefined) && visits === 5;
}
` }), "void-source-values");
});

test("void awaited unit and value operands preserve completion order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
let visits = 0;
async function value(): Promise<number> { visits += 1; return visits; }
async function unit(): Promise<void> { visits += 1; }
function optional(value: number | undefined): boolean { return value === undefined; }
export async function run(): Promise<boolean> {
  return optional(void await value()) && optional(void (await unit())) && visits === 2;
}
` }), "void-awaited-values", true);
});

test("qualified source builtins retain static operations and local shadows", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
function local(globalThis: { String: { fromCharCode: (value: number) => number } }): number {
  return globalThis.String.fromCharCode(7);
}
export function run(): boolean {
  const codes = [65, 66];
  const frozen = globalThis.Object.freeze({});
  return globalThis.String.fromCharCode(...codes) === "AB" &&
    (globalThis).String.fromCharCode(65) === "A" &&
    (globalThis.String).fromCodePoint(128512) === "😀" &&
    globalThis["String"].fromCharCode(...codes) === "AB" &&
    globalThis.Math.max(...[3, 7]) === 7 && globalThis.Object.isFrozen(frozen) &&
    local({ String: { fromCharCode: value => value + 1 } }) === 8;
}
` }), "qualified-source-builtins");
});

test("numeric sequence arguments retain holes, widths and source evaluation order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
function check(value: boolean): void { if (!value) throw new Error("sequence contract"); }
export function run(): boolean {
  const bytes: uint8[] = [65, 66];
  const empty: number[] = [];
  check(String.fromCharCode(...bytes, ...empty, ...[67, 68]) === "ABCD");
  check(String.fromCharCode(...empty) === "");
  check(String.fromCharCode(...[]) === "");
  const tuple: [uint8, number] = [65, 66];
  check(String.fromCharCode(...tuple) === "AB");
  let tupleReads = 0;
  const readTuple = (): [uint8, number] => { tupleReads += 1; return tuple; };
  check(String.fromCharCode(...readTuple(), ...[], 67) === "ABC" && tupleReads === 1);
  check(String.fromCodePoint(...[128512]) === "😀");
  check(Math.max(2, ...[3, 8], ...empty, 4) === 8);
  check(Math.min(...[3, 8], 2) === 2 && Math.hypot(...[3, 4]) === 5);
  const holes = new Array<number>(2);
  holes[0] = 65;
  check(String.fromCharCode(...holes) === "A\\0" && Number.isNaN(Math.max(...holes)));
  const mutable: number[] = [66];
  let evaluations = 0;
  const next = (): number => { evaluations += 1; mutable[0] = 88; return 67; };
  check(String.fromCharCode(65, ...mutable, next(), ...mutable) === "ABCX");
  check(evaluations === 1 && mutable[0] === 88);
  let caught = 0;
  try { String.fromCodePoint(...[1.5], next()); } catch { caught += 1; }
  check(caught === 1 && evaluations === 2);
  const fail = (): number => { throw new Error("stop"); };
  try { String.fromCharCode(...bytes, fail(), next()); } catch { caught += 1; }
  check(caught === 2 && evaluations === 2);
  return true;
}
` }), "numeric-rest-sequences");
});

test("character constructors preserve numeric coercion and exact runtime rejection", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
export function run(): boolean {
  const byte: uint8 = 66;
  const text = String.fromCharCode(65.9, byte, 67);
  const unicode = globalThis.String.fromCodePoint(0x1F600);
  let rejected = false;
  try { String.fromCodePoint(65.9); } catch { rejected = true; }
  return text === "ABC" && unicode === "😀" && rejected &&
    String.fromCharCode(-1.9).charCodeAt(0) === 65535 &&
    String.fromCharCode(Number.NaN).charCodeAt(0) === 0;
}
` }), "character-construction");
});

test("String construction preserves primitive and numeric-union values natively", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { int64, uint8 } from "@tsonic/core/types.js";
function numeric(value: number | bigint): string { return globalThis.String(value); }
export function run(): boolean {
  const wide: int64 = 9007199254740993n;
  const byte: uint8 = 255;
  let evaluations = 0;
  const evaluate = (): number => { evaluations += 1; return 7; };
  const absent = undefined;
  const missing = (): undefined => { evaluations += 1; return undefined; };
  const absenceChecks = String(absent) === "undefined" &&
    String(void evaluate()) === "undefined" && String(missing()) === "undefined" && evaluations === 2;
  return String() === "" && String(undefined) === "undefined" && String(null) === "null" &&
    String(true) === "true" && String(false) === "false" && String("a😀z") === "a😀z" &&
    String(-0) === "0" && String(1.5) === "1.5" && String(1e21) === "1e+21" &&
    String(Number.NaN) === "NaN" && String(Number.POSITIVE_INFINITY) === "Infinity" &&
    String(Number.NEGATIVE_INFINITY) === "-Infinity" &&
    String(wide) === "9007199254740993" && String(byte) === "255" &&
    String(-18446744073709551617n) === "-18446744073709551617" &&
    numeric(9007199254740993n) === "9007199254740993" && numeric(1.5) === "1.5" &&
    String(evaluate()) === "7" && evaluations === 3 && absenceChecks;
}
` }), "primitive-string-construction");
});

test("mapped native strings retain byte results and Unicode callback order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
export function run(): boolean {
  const bytes = Array.from("Aÿ", (part: string): uint8 => part.charCodeAt(0) as uint8);
  const parts = Array.from("a😀z", (part: string): string => part);
  const indices = Array.from("a😀z", (part: string, index: number): number => index);
  const fractions = Array.from("ab", function (part: string, index: number): number {
    index += 0.5;
    return index;
  });
  const captures = Array.from("ab", (part: string, index: number): (() => number) => {
    const __tsonic_param1 = 0.5;
    index += __tsonic_param1;
    return () => { index += 0.5; return index; };
  });
  const first = captures[0];
  const second = captures[1];
  let count = 0;
  const zero = Array.from("abc", (): number => { count += 1; return count; });
  const empty = Array.from("", (): number => { count += 1; return count; });
  let visited = "";
  let failed = false;
  try {
    Array.from("a😀z", (part: string, index: number): string => {
      visited += part;
      if (index === 1) throw new Error("stop");
      return part;
    });
  } catch { failed = true; }
  return bytes.length === 2 && bytes[0] === 65 && bytes[1] === 255 &&
    parts.length === 3 && parts.join("") === "a😀z" &&
    indices[0] === 0 && indices[2] === 2 && count === 3 &&
    zero[0] === 1 && zero[2] === 3 && empty.length === 0 && failed && visited === "a😀" &&
    fractions[0] === 0.5 && fractions[1] === 1.5 && first() === 1 && first() === 1.5 && second() === 2;
}
` }), "mapped-source-strings");
});

test("lambda parameter adaptation rejects an unproved implicit narrowing", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
export function run(): uint8[] { return Array.from("abc", (part: string, index: uint8): uint8 => index); }
` });
  assert(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_LAMBDA_PARAMETER_TYPE_CONFLICT"));
  assert.equal(compiled.result.artifacts.length, 0);
});

test("unrelated class unions preserve cross-file method dispatch and object aliasing", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", files: {
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
  execute(compileCsharpSource({
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
  execute(compileCsharpSource({ surface: "js", files: {
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

test("length constructors preserve holes and generic fill preserves token identity", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
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
      if (visits !== 0 || slots.length !== 3) return false;
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
  execute(compiled, "construction-shadows");
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /BigIntOps|EmptyObject\.Freeze/u);
});

test("stored Error throws preserve identity across parameters, return values and rethrows", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
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

test("nonempty writable shapes cannot silently use the empty frozen carrier", () => {
  for (const sourceText of [
    `export function example(): number { const value = { count: 1 }; Object.freeze(value); value.count = 2; return value.count; }`,
    `function freeze(value: object): object { return Object.freeze(value); } export function example(): object { return freeze({ count: 1 }); }`,
  ]) {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert(compiled.extensionDiagnostics.length + compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.artifacts.size, 0);
  }
});

test("generic object aliases retain exact pointer and byte arguments across nullable transport", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
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
