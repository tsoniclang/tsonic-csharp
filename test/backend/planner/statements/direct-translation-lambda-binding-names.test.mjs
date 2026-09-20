import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("expression-bodied call arguments retain their exact renamed lambda binding", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function map(language: int): int[] {
        const values: int[] = [1, 2];
        return Array.from(values, (language): int => language + 1);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static Tsonic.CSharp.Js.JSArray<int> map(int language)
        {
            Tsonic.CSharp.Js.JSArray<int> values = new Tsonic.CSharp.Js.JSArray<int>(new int[] { 1, 2 });
            return Tsonic.CSharp.Js.JSArrayStatics.fromDense<int, int>(values, (int language_1, int _) => language_1 + 1);
        }
    }
}
`);
});

test("an exported dense integer array retains exact callback and result carriers", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function map(values: int[], language: int): int[] {
        return Array.from(values, (language): int => language + 1);
      }
    `,
  });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /JSArray<int> map\(Tsonic\.CSharp\.Js\.JSArray<int> values, int language\)/u);
  assert.match(source, /fromDense<int, int>\(values, \(int language_1, int _\) => language_1 \+ 1\)/u);
  assert.doesNotMatch(source, /JSArray<double>|JSArray<int\?>/u);
});
