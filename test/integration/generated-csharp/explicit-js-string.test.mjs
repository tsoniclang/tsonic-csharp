import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("explicit JsString uses the existing native string reference without allocation or hidden conversion", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import { jsstr } from "@tsonic/js/lang.js";
    import type { JsString } from "@tsonic/js/types.js";
    export function transport(input: string): JsString { return jsstr(input); }
    export function units(input: string): boolean {
      const value = jsstr(input);
      return value.length === 3 && value.charCodeAt(0) === 55357 &&
        value.charCodeAt(1) === 56832 && value.charCodeAt(2) === 55296;
    }
    export function first(input: string): string {
      const value = jsstr(input);
      return (/a/.exec(value)?.[0] ?? value).toWellFormed();
    }
  ` });
  executeCsharpConstruction(compiled, "explicit-js-string", false, false, [], `
    var text = new string(new[] { '\\ud83d', '\\ude00', '\\ud800' });
    if (!object.ReferenceEquals(Tsonic.Generated.Index.transport(text), text))
      throw new System.Exception("explicit JsString must retain its native string identity");
    if (!Tsonic.Generated.Index.units(text)) throw new System.Exception("exact native UTF-16 units");
    if (Tsonic.Generated.Index.first("abc") != "a") throw new System.Exception("exact literal RegExp result");
    if (Tsonic.Generated.Index.first("xyz") != "xyz") throw new System.Exception("one native absence state");
    for (var index = 0; index < 100; index++) Tsonic.Generated.Index.transport(text);
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 10000; index++)
      if (!object.ReferenceEquals(Tsonic.Generated.Index.transport(text), text))
        throw new System.Exception("native identity changed");
    if (System.GC.GetAllocatedBytesForCurrentThread() != before)
      throw new System.Exception("explicit JsString transport allocated");
  `);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /public static string transport\(string input\)/u);
  assert.match(source, /return input;/u);
  assert.doesNotMatch(source, /\bjsstr\b|new\s+JsString|Convert\.ToString/u);
});
