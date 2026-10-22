import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";

test("JS source profile closes Error heritage and URI globals", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      export class NamedError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "NamedError";
        }
      }
      export function roundTrip(value: string): string {
        return decodeURIComponent(encodeURIComponent(value));
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /public class NamedError : Tsonic\.CSharp\.Runtime\.Error/u);
  assert.match(source, /public NamedError\(string message\) : base\(message\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Globals\.encodeURIComponent\(value\)/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Globals\.decodeURIComponent/u);
});

test("source string relations use exact UTF-16 ordinal ordering", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      export function compare(left: string, right: string): boolean[] {
        return [left < right, left <= right, left > right, left >= right];
      }
      export function supplementaryPrecedesPrivateUse(): boolean {
        return "𐀀" < "";
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /string\.CompareOrdinal\(left, right\) < 0/u);
  assert.match(source, /string\.CompareOrdinal\(left, right\) <= 0/u);
  assert.match(source, /string\.CompareOrdinal\(left, right\) > 0/u);
  assert.match(source, /string\.CompareOrdinal\(left, right\) >= 0/u);
  assert.match(source, /string\.CompareOrdinal\("𐀀", ""\) < 0/u);
});

test("selected Record index evidence preserves authored key and value representations", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function writeAndRead(
        values: Record<string, int>,
        key: string,
        value: int,
      ): int {
        values[key] = value;
        return values[key];
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /public static int writeAndRead\(System\.Collections\.Generic\.Dictionary<string, int> values, string key, int value\)[\s\S]*values\[key\] = value;[\s\S]*return values\[key\];/u,
  );
});
