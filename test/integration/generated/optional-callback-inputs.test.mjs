import assert from "node:assert/strict";
import test from "node:test";
import { optionalCallbackInputsSource, optionalAsyncCallbackInputsSource } from "../../../../tsonic/test/fixtures/optional-callback-inputs.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`optional callback inputs preserve exact absent aliases on ${lane}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: optionalCallbackInputsSource }), `optional-callback-inputs-${lane}`);
  });
}

test("optional async callback inputs retain exact Task completion and live captures", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: optionalAsyncCallbackInputsSource }), "optional-async-callback-inputs", true);
});

test("optional callback input validation rejects an incompatible authored payload", () => {
  const result = compileCsharpSource({ sourceText: `
    type Next = (value?: string | null) => void;
    function invoke(next: Next): void { next("route"); }
    export function run(): void { invoke((value?: number | null): void => {}); }
  ` });
  assert.match(result.sourceDiagnosticsText, /TS2345/u);
  assert.equal(result.artifacts.size, 0);
});
