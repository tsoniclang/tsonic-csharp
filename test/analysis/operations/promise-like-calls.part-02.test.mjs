import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { thenCalls } from "./promise-like-calls.fixtures.mjs";

test("native direct await remains native and does not import the JS continuation runtime", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    async function value(): Promise<number> { return 7; }
    export async function run(): Promise<boolean> { return await value() === 7; }` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(output.includes("PromiseRuntime"), false, "the no-JS native await path has no compatibility continuation helper");
  executeCsharpConstruction(compiled, "promise-like-native-control", true);
});
