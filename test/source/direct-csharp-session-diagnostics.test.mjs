import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
} from "../helpers/direct-csharp-session.mjs";

function captureFailure(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  assert.fail("expected action to fail");
}

test("successful-session assertions never traverse compiler-owned diagnostic evidence", () => {
  const diagnostic = {
    code: "TARGET_TEST_FAILURE",
    message: `bounded ${"x".repeat(2_000)}`,
  };
  Object.defineProperty(diagnostic, "evidence", {
    get() {
      throw new Error("compiler-owned evidence was traversed");
    },
  });
  const compiled = {
    sourceDiagnosticsText: "",
    extensionDiagnostics: [],
    result: { diagnostics: [diagnostic] },
  };

  const error = captureFailure(() => assertCsharpCompilationSucceeded(compiled));
  assert.match(error.message, /TARGET_TEST_FAILURE/u);
  assert.match(error.message, /<truncated>/u);
  assert.doesNotMatch(error.message, /compiler-owned evidence was traversed/u);
  assert.ok(error.message.length < 1_000);
});

test("successful-session assertions accept an entirely clean compilation", () => {
  assert.doesNotThrow(() => assertCsharpCompilationSucceeded({
    sourceDiagnosticsText: "",
    extensionDiagnostics: [],
    result: { diagnostics: [] },
  }));
});
