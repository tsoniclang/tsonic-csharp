import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCsharpTarget } from "../../dist/backend/compile.js";
import { createCsharpTargetConfiguration } from "../../dist/options/csharp-target-options.js";
import { createCsharpProviderRelationResolver } from "../../dist/providers/relations/resolver.js";
import { createTargetSourceProgram } from "../../../tsonic/packages/target-api/dist/public/source.js";
import { checkCsharpSource } from "../helpers/direct-csharp-session.mjs";

const mutation = Object.freeze({ extensionId: "fixture", extensionCode: "REFERENCES_CHANGED",
  numericCode: 9100001, category: "error", message: "Reference mutation detected" });

test("compilation rejects an invalid reference snapshot before inspecting source", () => {
  const result = compileCsharpTarget({
    providers: { validateReferences: () => [mutation] },
    get input() { assert.fail("Invalid reference snapshot reached analysis"); },
  });
  assert.equal(result.kind, "rejected");
  assert.equal(result.diagnostics[0].message, mutation.message);
  assert.equal("value" in result, false);
});

test("compilation rechecks reference integrity before returning generated artifacts", () => {
  const checked = checkCsharpSource({ sourceText: "export function sum(left: number, right: number): number { return left + right; }" });
  assert.equal(checked.sourceDiagnosticsText, "");
  const resolver = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] });
  const request = {
    configuration: createCsharpTargetConfiguration(checked.target, fileURLToPath(new URL("../../", import.meta.url)), checked.paths.targetOutputRoot),
    input: { source: createTargetSourceProgram(checked.source), sourcePackages: checked.sourcePackages,
      project: checked.project, target: checked.target, runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    providers: resolver,
  };
  const control = compileCsharpTarget(request);
  assert.equal(control.kind, "resolved", JSON.stringify(control.diagnostics));
  assert.ok(control.value.artifacts.some(artifact => artifact.path.endsWith(".cs")));
  let validations = 0;
  const changed = compileCsharpTarget({ ...request, providers: { ...resolver,
    validateReferences() { validations += 1; return validations === 1 ? [] : [mutation]; },
  } });
  assert.equal(validations, 2);
  assert.equal(changed.kind, "rejected");
  assert.equal(changed.diagnostics.at(-1).message, mutation.message);
  assert.equal("value" in changed, false);
});
