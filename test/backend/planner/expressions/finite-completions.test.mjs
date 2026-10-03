import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

function generated(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return [...compiled.artifacts.values()].join("\n");
}

test("finite await handles synchronous and valued Task alternatives without creating another Task", () => {
  const source = generated(`
    import type { int32 } from "@tsonic/core/types.js";
    export async function completed(value: int32 | Promise<int32>): Promise<int32> {
      return await value;
    }
    export async function optional(value: int32 | Promise<int32 | undefined> | undefined): Promise<int32 | undefined> {
      return await value;
    }
  `);
  assert.match(source, /switch/u);
  assert.match(source, /await/u);
  assert.doesNotMatch(source, /ContinueWith|Task\.Run|Task\.FromResult|new (?:System\.)?Func/u);
});

test("discarded finite await retains original completion, failure and cancellation without wrapper tasks", () => {
  const source = generated(`
    import type { int32 } from "@tsonic/core/types.js";
    export async function discard(value: int32 | Promise<int32> | Promise<void> | undefined): Promise<void> {
      await value;
    }
  `);
  assert.match(source, /await .*switch/su);
  assert.match(source, /Task\.CompletedTask/u);
  assert.doesNotMatch(source, /ContinueWith|Task\.Run|Task\.FromResult|async .*=>/u);
});

test("an exact Task return enters a closed callable union without a result adaptation task", () => {
  const source = generated(`
    import type { int32 } from "@tsonic/core/types.js";
    export function retain(callback: () => Promise<int32>): () => int32 | Promise<int32> {
      return callback;
    }
  `);
  assert.match(source, /From[12]\(/u);
  assert.doesNotMatch(source, /await|ContinueWith|Task\.FromResult/u);
});

test("native nullable closed payload widening preserves the original field and array carriers", () => {
  const source = generated(`
    import type { int32 } from "@tsonic/core/types.js";
    type Body = string | int32 | boolean | { label: string } | int32[] | null | undefined;
    export function accept(value?: Body): Body { return value; }
    export function forward(value: Body): Body { return accept(value); }
    export function scalar(value: string | int32): string | undefined { return value as string; }
  `);
  assert.doesNotMatch(source, /TsValue|reflection|Dynamic/u);
  assert.match(source, /As[12]\(/u);
});
