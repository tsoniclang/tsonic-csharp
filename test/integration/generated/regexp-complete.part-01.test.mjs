import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

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
        let callbackArgumentsAreExact = false;
        const callbackReplacement = "a1".replace(
          /([a-z])(\\d)/,
          (whole, letter, digit, offset, original) => {
            callbackArgumentsAreExact = whole === "a1" && letter === "a" &&
              digit === "1" && offset === 0 && original === "a1";
            return digit + letter;
          },
        );
        const all = input.replaceAll(/\\d+/g, (whole, ...rest) => whole);
        const searched = input.search(dynamic);
        const split = input.split(dynamic, 3);
        return RegExp.escape(first) + named + indexed + matched + count +
          replaced + callbackReplacement + callbackArgumentsAreExact + all +
          searched + split.length + called.source;
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
  const indexed = source.split("\n").find(line => line.trimStart().startsWith("double indexed ="));
  assert.ok(indexed);
  assert.match(indexed, /^\s*double indexed = \(executed\?\.indices is Tsonic\.CSharp\.Js\.RegExpIndicesArray (__tsonic_present_\d+) \? \1\[0D\] : default\(\(int, int\)\?\)\)\?\.Item1 \?\? -1D;$/u);
  const nativeIndices = compileCsharpSource({ surface: "js", sourceText: `
    export function start(input: string): number {
      return /a/d.exec(input)?.indices?.[0]?.[0] ?? -1;
    }
  ` });
  assertCsharpCompilationSucceeded(nativeIndices);
  executeCsharpConstruction(nativeIndices, "regexp-native-indices", false, false, [],
    'if (Tsonic.Generated.Index.start("a") != 0D || Tsonic.Generated.Index.start("z") != -1D) throw new System.Exception("native RegExp indices and absence");');
});
