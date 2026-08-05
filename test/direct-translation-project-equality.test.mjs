import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

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
  assert.match(source, /return left == right;/);
  assert.doesNotMatch(source, /dynamic|System\.Reflection|__unsupported/);
});

test("strict equality does not assume provider classes use CLR reference equality", () => {
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
  assert.equal(compiled.artifacts.has("src/Index.cs"), false);
  assert.match(
    compiled.targetDiagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    /requires an exact provider operator relation/u,
  );
});
