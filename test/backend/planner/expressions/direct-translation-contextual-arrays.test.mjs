import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("provider array-input capability materializes a native array literal", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
      export function create(): List<int> {
        return new List<int>([1, 2, 3]);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /return new System\.Collections\.Generic\.List<int>\(new int\[\] \{ 1, 2, 3 \}\);/u,
  );
});

test("JS read-only array queries use the closed helper relation", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      export function includes(values: string[], value: string): boolean {
        return values.includes(value);
      }
      export function indexOf(values: string[], value: string): number {
        return values.indexOf(value);
      }
      export function lastIndexOf(values: string[], value: string): number {
        return values.lastIndexOf(value);
      }
      export function join(values: string[]): string {
        return values.join("|");
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /Tsonic\.CSharp\.Js\.Array\.includes\(values, value\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Array\.indexOf\(values, value\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Array\.lastIndexOf\(values, value\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Array\.join\(values, "\|"\)/u);
});
