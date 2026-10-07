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
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Tsonic.CSharp.Js.JSArray<int> map(int language)
        {
            Tsonic.CSharp.Js.JSArray<int> values = Tsonic.CSharp.Js.JSArray<int>.of([1, 2]);
            Tsonic.CSharp.Js.JSArray<int> __tsonic_value_161 = values;
            static int __tsonic_callable_180(int language_1, int __tsonic_param0)
            {
                return language_1 + 1;
            }
            return Tsonic.CSharp.Js.JSArrayStatics.fromDense<int, int>(__tsonic_value_161, (Func<int, int, int>)__tsonic_callable_180);
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
  assert.match(source, /static int __tsonic_callable_157\(int language_1, int __tsonic_param0\)\s*\{\s*return language_1 \+ 1;\s*\}/u);
  assert.match(source, /fromDense<int, int>\(__tsonic_value_138, \(Func<int, int, int>\)__tsonic_callable_157\)/u);
  assert.doesNotMatch(source, /new Func|Dictionary|Reflection|\.Invoke/u, "sealed invocation-only binding has no fresh delegate or adapter cost");
  assert.doesNotMatch(source, /JSArray<double>|JSArray<int\?>/u);
});
