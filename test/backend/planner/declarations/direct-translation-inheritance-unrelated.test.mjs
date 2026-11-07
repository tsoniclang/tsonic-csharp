import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

test("same-shaped unrelated project classes fail closed at the C# nominal boundary", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class Left {}
    export class Right {}
    export function consume(value: Left): void {}
    export function run(): void { consume(new Right()); }
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.equal(compiled.result.diagnostics.length, 1);
  // nextgen C-2542: split code; a value use whose conversion core rejects is CSHARP_VALUE_USE_NOT_ADMITTED (use-admission.ts).
  assert.equal(compiled.result.diagnostics[0].code, "CSHARP_VALUE_USE_NOT_ADMITTED");
  assert.match(
    compiled.result.diagnostics[0].message,
    /No exact C# implicit conversion relates/u,
  );
  assert.deepEqual(compiled.result.artifacts, []);
});
