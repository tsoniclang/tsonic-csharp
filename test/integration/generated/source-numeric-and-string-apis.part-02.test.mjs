import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { nativeCharacterInputsSource } from "../../../../tsonic/test/fixtures/native-character-inputs.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericNumberPredicatesSource } from "../../../../tsonic/test/fixtures/generic-number-predicates.mjs";

test("RegExp index collections preserve native pairs for both string carriers", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    import { jsstr } from "@tsonic/js/lang.js";
    function native(): int32 {
      const matched = /(?<word>ab)/d.exec("zab");
      if (matched === null) return 0;
      let total: int32 = 0;
      for (const pair of matched.indices!) {
        if (pair !== undefined) total += pair[0] + pair[1];
      }
      return total + matched.indices!.groups!.word![0];
    }
    function exact(): int32 {
      const matched = /(?<word>ab)/d.exec(jsstr("zab"));
      if (matched === null) return 0;
      let total: int32 = 0;
      for (const pair of matched.indices!) {
        if (pair !== undefined) total += pair[0] + pair[1];
      }
      return total + matched.indices!.groups!.word![0];
    }
    export function run(): boolean { return native() === 9 && exact() === 9; }
  ` });
  executeCsharpConstruction(compiled, "native-regexp-index-pairs");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(generated, /double|Convert\.ToDouble/u);
  assert.match(generated, /\(int, int\)\? pair/u);
});

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
test(`inferred array literals retain native elements and explicit contexts (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32, int64 } from "@tsonic/core/types.js";
      export function run(): boolean {
        const wide: int64 = 9007199254740993n;
        const values = [wide];
        const copied = [...values, wide];
        const small: int32 = 17;
        const converted: number[] = [small];
        const tuple = [wide, "text"] as const;
        return copied.${surface === "js" ? "length" : "Length"} === 2 && copied[0] === wide && copied[1] === wide &&
          converted[0] === 17 && tuple[0] === wide && tuple[1] === "text";
      }
    ` });
    executeCsharpConstruction(compiled, `native-array-elements-${surface ?? "native"}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /(?:long\[\]|JSArray<long>) values/u);
    assert.match(generated, /(?:long\[\]|JSArray<long>) copied/u);
    assert.match(generated, /(?:double\[\]|JSArray<double>) converted/u);
    assert.match(generated, /\(long, string\) tuple/u);
    assert.doesNotMatch(generated, /BigInteger|Convert\.ToDouble|\(double\)wide/u);
  });
}

test("generic nullable fields preserve native widths through guards and assertions", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int64, uint32 } from "@tsonic/core/types.js";
    class Box<Value> { value: Value; constructor(value: Value) { this.value = value; } }
    function read(box: Box<int64 | undefined>): int64 {
      if (box.value === undefined) return 0n;
      return box.value;
    }
    function unsigned(box: Box<uint32 | null>): uint32 {
      if (box.value === null) return 0;
      return box.value;
    }
    function asserted(box: Box<int64 | undefined>): int64 { return box.value!; }
    function text(box: Box<string | undefined>): string { return box.value!; }
    export function run(): boolean {
      const wide: int64 = 9007199254740993n;
      const full = new Box<int64 | undefined>(wide);
      const absent = new Box<int64 | undefined>(undefined);
      const maximum: uint32 = 4294967295;
      return read(full) === wide && read(absent) === 0n && asserted(full) === wide &&
        unsigned(new Box<uint32 | null>(maximum)) === maximum && unsigned(new Box<uint32 | null>(null)) === 0 &&
        text(new Box<string | undefined>("native")) === "native";
    }
  ` });
  executeCsharpConstruction(compiled, "generic-nullable-native-carriers");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(generated, /BigInteger|Convert\.ToDouble|\(double\)/u);
  assert.match(generated, /box\.value!\.Value/u);
  assert.match(generated, /return box\.value!;/u);
});

test("character constructors preserve numeric coercion and exact runtime rejection", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
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
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
import type { int64, uint8 } from "@tsonic/core/types.js";
function numeric(value: number | bigint): string { return globalThis.String(value); }
export function run(): boolean {
  const wide: int64 = 9007199254740993n;
  const byte: uint8 = 255;
  let evaluations = 0;
  const evaluate = (): number => { evaluations += 1; return 7; };
  const absent = undefined;
  const missing = (): undefined => { evaluations += 1; return undefined; };
  const absenceChecks = String(absent) === "null" &&
    String(void evaluate()) === "null" && String(missing()) === "null" && evaluations === 2;
  return String() === "" && String(undefined) === "null" && String(null) === "null" &&
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
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
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
