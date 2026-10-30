import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpSourceDiagnosticLabel } from "../../helpers/source-diagnostic-label.mjs";

test("an absent fulfilled handler keeps generic rejection delivery under the actual Promise resolver owner", () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
function wrap<Value>(value: Value): Promise<Value> {
  return new Promise<Value>(resolve => {
    void Promise.reject<number>(new Error("seed")).then(undefined, () => { resolve(value); });
  });
}
console.log(await wrap(7));
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = executeCsharpConstruction(compiled, "absent-fulfilled-resolver", false, false, [], "");
  assert.equal(output.trim(), "7", "the actual retained ordinary-matrix resolver body runs and preserves its payload");
});
