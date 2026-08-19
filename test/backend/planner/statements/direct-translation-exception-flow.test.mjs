import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("strict C# catch storage remains System.Exception through exact provider narrowing and rethrow", () => {
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
  assert.match(source, /catch \(System\.Exception error\)/);
  assert.match(source, /if \(error is System\.FormatException\)/);
  assert.match(source, /throw;/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});

test("strict C# omits a catch binding whose only source use lowers to an exact rethrow", () => {
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

test("strict C# preserves explicit throw when the active catch binding is reassigned", () => {
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
  assert.match(source, /catch \(System\.Exception error\)/);
  assert.match(source, /error = new System\.Exception\("replacement"\);/);
  assert.match(source, /throw error;/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});

test("strict C# carries project exception heritage through throw and catch narrowing", () => {
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
  assert.match(source, /catch \(System\.Exception error\)/);
  assert.match(source, /if \(error is ReturnSignal\)/);
  assert.match(source, /return \(\(ReturnSignal\)error\)\.value;/);
  assert.match(source, /throw;/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});
