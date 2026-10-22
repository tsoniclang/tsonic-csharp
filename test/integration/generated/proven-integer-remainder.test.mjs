import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { integerRemainderExecutionSource } from "../../../../tsonic/test/fixtures/proven-integer-remainder.mjs";

// The fixture's shadowed() declares 'const value' in a block nested in a body that declares 'const value': C# CS0136.
// PORT-MAP (names/plan.ts): authored values keep their spelling and native CS0136 collisions reject before sealing
// (RULINGS 2026-10-23), so the C# target refuses the nested binding and publishes nothing.
test("proven integer remainder fixture refuses its C# CS0136 binding collision before publication", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `${integerRemainderExecutionSource()}
import type { float16 } from "@tsonic/core/types.js";
export function halfZero(): float16 { return -0; }` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.result.diagnostics.map(({ code, message }) => ({ code, message })), [{
    code: "CSHARP_INVALID_IDENTIFIER",
    message: "Authored binding 'value' conflicts with an enclosing C# local declaration space (CS0136); its spelling cannot be changed.",
  }]);
  assert.equal(compiled.artifacts.size, 0);
});
