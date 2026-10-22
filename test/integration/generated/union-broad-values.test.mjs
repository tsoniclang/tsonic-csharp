import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { unionBroadValuesSource } from "../../../../tsonic/test/fixtures/union-broad-values.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native union leaves retain their broad scalar values", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: unionBroadValuesSource });
  assertNoTargetDiagnostics(compiled.result.diagnostics);
  executeCsharpConstruction(compiled, "union-broad-values");
});
