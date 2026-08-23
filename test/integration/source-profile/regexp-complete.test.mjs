import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";

test("complete RegExp operations consume selected JS-source-profile evidence", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      export function exercise(pattern: string, flags: string, input: string): string {
        const dynamic = new RegExp(pattern, flags);
        const called = RegExp(dynamic);
        const cloned = new RegExp(dynamic, "dgu");
        dynamic.lastIndex = 2;
        const executed = dynamic.exec(input);
        const first = executed?.[0] ?? "";
        const named = executed?.groups?.word ?? "";
        const indexed = executed?.indices?.[0]?.[0] ?? -1;
        const matched = input.match(cloned)?.[0] ?? "";
        let count = 0;
        for (const item of input.matchAll(/(?<word>\\p{Letter}+)/dgu)) {
          count += item.length;
        }
        const replaced = input.replace(
          /(?<word>\\p{Letter}+)(\\d+)?/dgu,
          (whole, capture, offset, original, groups) => whole,
        );
        const all = input.replaceAll(/\\d+/g, (whole, ...rest) => whole);
        const searched = input.search(dynamic);
        const split = input.split(dynamic, 3);
        return RegExp.escape(first) + named + indexed + matched + count +
          replaced + all + searched + split.length + called.source;
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /new Tsonic\.CSharp\.Js\.RegExp\(pattern, flags\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.RegExp\.create/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.RegExp\.escape/u);
  assert.match(source, /ReplacementCallbackArguments/u);
  assert.match(source, /matchAll/u);
  assert.match(source, /replaceAll/u);
  assert.match(source, /indices\?\[0\]\?\.Item1/u);
});

test("custom well-known RegExp protocols use exact structural member evidence", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      export function protocols(input: string): string {
        const matcher = {
          [Symbol.match](value: string): RegExpMatchArray | null {
            return /a/.exec(value);
          },
        };
        const searcher = {
          [Symbol.search](_value: string): number { return 7; },
        };
        const replacer = {
          [Symbol.replace](_value: string, replacement: string): string {
            return replacement;
          },
        };
        const splitter = {
          [Symbol.split](value: string, _limit?: number): string[] {
            return [value];
          },
        };
        return (input.match(matcher)?.[0] ?? "") + input.search(searcher) +
          input.replace(replacer, "x") + input.split(splitter)[0];
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.doesNotMatch(source, /RegExpProtocolDispatch[^\n]*"match"/u);
  assert.match(source, /RegExpProtocolDispatch\.Invoke/u);
  assert.match(source, /__tsonic_shape_method_0_match/u);
  assert.match(source, /__tsonic_shape_method_0_search/u);
  assert.match(source, /__tsonic_shape_method_0_replace/u);
  assert.match(source, /__tsonic_shape_method_0_split/u);
});

test("same-spelled project members never acquire RegExp runtime identity", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      class Local {
        replace(_input: string, _value: string): string { return "local"; }
        search(_input: string): number { return 9; }
      }
      export function local(): string {
        const value = new Local();
        return value.replace("a", "b") + value.search("a");
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /new Local/u);
  assert.doesNotMatch(source, /Tsonic\.CSharp\.Js\.RegExp/u);
  assert.doesNotMatch(source, /Tsonic\.CSharp\.Js\.String\.replace/u);
});
