import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpTarget } from "../../dist/backend/compile.js";
import { compileCsharpSource } from "../helpers/direct-csharp-session.mjs";

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
  // Both compilations run inside the session's compile hook, with its real provider acquisition and resolver: the
  // analysis acquires runtime metadata and native inheritance through them before it seals.
  let validations = 0;
  let checkedHook = false;
  const compiled = compileCsharpSource({ sourceText: "export function sum(left: number, right: number): number { return left + right; }",
    compileTarget(request, observer) {
      const control = compileCsharpTarget(request);
      assert.equal(control.kind, "resolved", JSON.stringify(control.diagnostics));
      assert.ok(control.value.artifacts.some(artifact => artifact.path.endsWith(".cs")));
      const changed = compileCsharpTarget({ ...request, providers: { ...request.providers,
        validateReferences() { validations += 1; return validations === 1 ? [] : [mutation]; },
      } });
      assert.equal(validations, 2);
      assert.equal(changed.kind, "rejected");
      assert.equal(changed.diagnostics.at(-1).message, mutation.message);
      assert.equal("value" in changed, false);
      checkedHook = true;
      return compileCsharpTarget(request, observer);
    } });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(checkedHook, true, "the session ran both compilations");
});
