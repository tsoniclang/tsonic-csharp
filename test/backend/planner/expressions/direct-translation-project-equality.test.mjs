import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("strict equality preserves reference identity for one project class", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export class Page {}
      export function same(left: Page, right: Page): boolean {
        return left === right;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /return object\.ReferenceEquals\(left, right\);/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});

test("strict equality preserves reference identity for exact provider classes", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Uri } from "@tsonic/dotnet/System.js";
      export function same(left: Uri, right: Uri): boolean {
        return left === right;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /return object\.ReferenceEquals\(left, right\);/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});
