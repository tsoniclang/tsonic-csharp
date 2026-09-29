import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

test("C# authored declarations and cross-file aliases retain exact spelling", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      import { publicValue as localValue, http_response } from "./barrel.js";
      export function readValue(): int32 { return localValue(new http_response(7).makeValue(0)); }
    `,
    files: {
      "MixedCase.ts": `
        import type { int32 } from "@tsonic/core/types.js";
        export class http_response {
          URLValue: int32;
          constructor(inputValue: int32) { this.URLValue = inputValue; }
          makeValue(unusedValue: int32): int32 { return this.URLValue; }
        }
        export function makeValue(inputValue: int32): int32 { return inputValue; }
        export const moduleValue: int32 = 7;
        export enum http_status { inProgress = 1, HTTP_OK = 2 }
      `,
      "barrel.ts": 'export { makeValue as publicValue, http_response } from "./MixedCase.js";',
    },
  });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const output = [...compiled.artifacts.entries()].filter(([path]) => path.endsWith(".cs"))
    .map(([, content]) => content).join("\n");
  for (const name of ["http_response", "URLValue", "inputValue", "unusedValue", "makeValue", "moduleValue", "http_status", "inProgress", "HTTP_OK", "readValue"]) {
    assert.match(output, new RegExp(`\\b${name}\\b`, "u"));
  }
  assert.doesNotMatch(output, /\b(?:HttpResponse|MakeValue|make_value|_unusedValue|MODULE_VALUE)\b/u);
});

test("C# keyword escaping and generated module collisions never rename authored declarations", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class Index { event: string = "ready"; }
    export function makeValue(event: string): string { return event; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const output = [...compiled.artifacts.entries()].filter(([path]) => path.endsWith(".cs"))
    .map(([, content]) => content).join("\n");
  assert.match(output, /class Index\b/u);
  assert.match(output, /class IndexModule\b/u);
  assert.match(output, /string @event/u);
  assert.match(output, /makeValue\(string @event\)/u);
  assert.doesNotMatch(output, /\bmake_value\b|\bMakeValue\b/u);
});
