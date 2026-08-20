import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("canonical C# catch storage preserves exact provider narrowing and rethrow", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { FormatException, Int32 } from "@tsonic/dotnet/System.js";
      import type { int } from "@tsonic/csharp/types.js";
      export function parse(value: string): int {
        try {
          return Int32.Parse(value);
        } catch (error) {
          if (error instanceof FormatException) return 0;
          throw error;
        }
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /return System\.Int32\.Parse\(value\);/);
  assert.match(source, /catch \(System\.Exception __tsonic_catch0\)/);
  assert.match(source, /TsValue error = Tsonic\.CSharp\.Js\.TsThrownValueException\.toValue\(__tsonic_catch0\);/);
  assert.match(source, /if \(Tsonic\.CSharp\.Js\.TsValue\.IsDynamicInstanceOf<System\.FormatException>\(error\)\)/);
  assert.match(source, /throw;/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});

test("canonical C# omits a catch binding whose only source use lowers to an exact rethrow", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function fail(): void {
        try {
          return;
        } catch (error) {
          throw error;
        }
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.equal(source, `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static void fail()
        {
            try
            {
                return;
            }
            catch
            {
                throw;
            }
        }
    }
}
`);
});

test("canonical C# preserves explicit throw when the active catch binding is reassigned", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Exception } from "@tsonic/dotnet/System.js";
      export function replaceAndThrow(): void {
        try {
          throw new Exception("original");
        } catch (error) {
          error = new Exception("replacement");
          throw error;
        }
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /catch \(System\.Exception __tsonic_catch0\)/);
  assert.match(source, /TsValue error = Tsonic\.CSharp\.Js\.TsThrownValueException\.toValue\(__tsonic_catch0\);/);
  assert.match(source, /error = Tsonic\.CSharp\.Js\.TsValue\.from\(new System\.Exception\("replacement"\)\);/);
  assert.match(source, /throw Tsonic\.CSharp\.Js\.TsThrownValueException\.from\(error\);/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});

test("canonical C# carries project exception heritage through throw and catch narrowing", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Exception } from "@tsonic/dotnet/System.js";
      export class ReturnSignal extends Exception {
        value: string;
        constructor(value: string) {
          super("return");
          this.value = value;
        }
      }
      export function run(): string {
        try {
          throw new ReturnSignal("done");
        } catch (error) {
          if (error instanceof ReturnSignal) return error.value;
          throw error;
        }
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /throw new ReturnSignal\("done"\);/);
  assert.match(source, /catch \(System\.Exception __tsonic_catch0\)/);
  assert.match(source, /if \(Tsonic\.CSharp\.Js\.TsValue\.IsDynamicInstanceOf<ReturnSignal>\(error\)\)/);
  assert.match(source, /return Tsonic\.CSharp\.Js\.TsValue\.CastDynamic<ReturnSignal>\(error\)\.value;/);
  assert.match(source, /throw;/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});
