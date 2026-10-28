import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpCallableContractIndexesEqual } from "../../../dist/analysis/callables/analyze.js";
import { overloaded, cases } from "./generic-permission-origins.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const explicit of Array.from([false, true]).slice(0, 2)) {
test(`${surface} overloaded source permission remains native false (${explicit ? "explicit" : "inferred"})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { int32 } from "@tsonic/core/types.js";
        import { Span } from "@tsonic/dotnet/System.js";
        ${overloaded}
        export function fail(value: Span<int32>): int32 {
          return pass${explicit ? "<Span<int32>>" : ""}(value).Length;
        }` });
      assert.equal(compiled.sourceDiagnosticsText, "", "the actual source generic instantiation is checked");
      assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_GENERIC_ARGUMENT"), true,
        `the proved ordinary source slot retains its actual native no-ref-struct permission: ${compiled.result.diagnostics
          .slice(0, 4).map(issue => `${issue.code}: ${issue.message.slice(0, 1024)}`).join(" | ")}`);
      assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_METADATA_NOT_PROVEN"), false,
        "an exact checked project overload no longer lacks its producer contract");
      assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
        "the invalid native instantiation is refused before publication");
    });
}
}

test("callable contract equality includes every required generic permission without changing source binder identity", () => {
  const declaration = Object.freeze({});
  const contract = Object.freeze({ kind: "source", sourceDeclaration: declaration,
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: Object.freeze(["source:identity:0"]),
    methodAllowsRefLikeTypeArguments: Object.freeze([false]) }), parameters: Object.freeze([]), nativeParameters: Object.freeze([]),
    returnType: Object.freeze({ kind: "source-primitive", name: "int32" }) });
  const index = (selected, closedInputs = []) => Object.freeze({ contracts: Object.freeze([selected]), declarationContracts: Object.freeze([selected]),
    closedInputs: Object.freeze(closedInputs), closedInputType: () => undefined, closedInputContract: () => undefined,
    get: identity => identity.declaration === declaration ? selected : undefined });
  assert.equal(csharpCallableContractIndexesEqual(index(contract), index({ ...contract })), true,
    "identical required permission metadata is stable");
  assert.equal(csharpCallableContractIndexesEqual(index(contract),
    index({ ...contract, nativeSignature: { ...contract.nativeSignature, methodAllowsRefLikeTypeArguments: Object.freeze([true]) } })), false,
  "a changed actual slot permission cannot be treated as the same contract");
  assert.equal(csharpCallableContractIndexesEqual(index(contract),
    index({ ...contract, nativeSignature: { ...contract.nativeSignature, methodAllowsRefLikeTypeArguments: Object.freeze([]) } })), false,
  "a missing slot is not silently normalized to native false");
  const alias = Object.freeze({});
  const closed = { declaration: alias, input: { type: contract.returnType, source: contract } };
  assert.equal(csharpCallableContractIndexesEqual(index(contract, [closed]), index(contract, [closed])), true,
    "an unchanged published input remains stable");
  assert.equal(csharpCallableContractIndexesEqual(index(contract), index(contract, [closed])), false,
    "the iteration cannot settle before an actual closed alias is published");
  assert.equal(csharpCallableContractIndexesEqual(index(contract, [closed]),
    index(contract, [{ ...closed, input: { type: contract.returnType } }])), false,
    "physical input equality does not hide a change in the actual source implementation authority");
});
