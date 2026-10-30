import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("explicit JsString preserves exact UTF-16 semantics without changing native string defaults", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import { jsstr } from "@tsonic/js/lang.js";
      import type { JsString } from "@tsonic/js/types.js";

      export function exact(input: string): string {
        const value: JsString = jsstr(input);
        const first: JsString = value.charAt(0);
        const matched: JsRegExpExecArray | null = /./.exec(value);
        return RegExp.escape(first) + (matched?.[0] ?? first).toWellFormed();
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /Tsonic\.CSharp\.Js\.String\.charAt\(value, 0\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.RegExp\.escape\(first\)/u);
  assert.match(source, /\.exec\(value\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.String\.toWellFormed/u);
  assert.doesNotMatch(source, /\bjsstr\b|new\s+JsString/u);
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
        const optionalSplitter = {
          [Symbol.split](value: string, _limit?: number): (string | undefined)[] {
            return [undefined, value];
          },
        };
        return (input.match(matcher)?.[0] ?? "") + input.search(searcher) +
          input.replace(replacer, "x") + input.split(splitter)[0] +
          (input.split(optionalSplitter)[0] ?? "missing");
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.doesNotMatch(source, /RegExpProtocolDispatch[^\n]*"match"/u);
  assert.match(source, /RegExpProtocolDispatch\.Invoke/u);
  assert.match(source, /__tsonic_protocol\.match\(__tsonic_input\)/u);
  assert.match(source, /__tsonic_protocol\.search\(__tsonic_input\)/u);
  assert.match(source, /__tsonic_protocol\.replace\(__tsonic_input, __tsonic_protocolArgument0\)/u);
  assert.match(source, /__tsonic_protocol\.split\(__tsonic_input\)/u);
  executeCsharpConstruction(compiled, "regexp-native-protocols", false, false, [],
    'if (Tsonic.Generated.Index.protocols("a") != "a7xamissing") throw new System.Exception("native RegExp protocol dispatch");');
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

test("closed native RegExp tests omit result materialization without bypassing unknown overrides", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function local(input: string, pattern: string): boolean {
      const literal = /a/g;
      const dynamic = new RegExp(pattern);
      return literal.test(input) && dynamic.test(input);
    }
    export function unknown(expression: RegExp, input: string): boolean {
      return expression.test(input);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /literal\.testNative\(input\)/u);
  assert.match(source, /dynamic\.testNative\(input\)/u);
  assert.match(source, /expression\.test\(input\)/u);
});
