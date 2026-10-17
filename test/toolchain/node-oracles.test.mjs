import assert from "node:assert/strict";
import test from "node:test";
import { nodeOraclePrograms, runNodeOracle, runNativeNodeOracle } from "../helpers/node-oracles.mjs";
import { nodeOraclePrograms as sharedPrograms, runNodeOracle as sharedNodeRunner } from "../../../tsonic/test/fixtures/node-oracle/index.mjs";
import { compileCsharpSource } from "../helpers/direct-csharp-session.mjs";
import { assertNoTargetDiagnostics } from "../../../tsonic/test/scripts/diagnostic-assertions.mjs";

test("C# consumes the one shared oracle catalogue and Node reference runner", () => {
  assert.equal(nodeOraclePrograms === sharedPrograms, true);
  assert.equal(runNodeOracle === sharedNodeRunner, true);
  assert.equal(typeof runNativeNodeOracle, "function");
  assert.equal(nodeOraclePrograms.length, 11);
});

test("C# helper library defaults never infer output kind from the authored main name", () => {
  const compiled = compileCsharpSource({ sourceText: "export function main(): void {}" });
  assertNoTargetDiagnostics(compiled.result.diagnostics);
  assert.equal(compiled.target.options.outputType, "Library");
  assert.equal(compiled.project.targets[0].options.outputType, "Library");
  assert.equal(compiled.artifacts.has("generated/TsonicEntrypoint.cs"), false);
});

test("C# helper explicit executable configuration retains entry validation", () => {
  const compiled = compileCsharpSource({ targetOptions: { outputType: "Exe" },
    sourceText: "export function main(): void {}" });
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "TSONIC_UNCALLED_BINARY_ENTRY_MAIN"), true);
  assert.equal(compiled.artifacts.size, 0);
});
