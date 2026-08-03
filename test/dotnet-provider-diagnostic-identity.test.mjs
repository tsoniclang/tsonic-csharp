import assert from "node:assert/strict";
import test from "node:test";

import {
  dotnetExtensionDiagnostic,
} from "../dist/providers/dotnet/provider-diagnostics.js";

test(".NET provider diagnostics have deterministic evidence-complete identities", () => {
  const first = dotnetExtensionDiagnostic(
    "example.provider",
    "EXAMPLE_CONTRACT_INVALID",
    9200000,
    "Invalid provider contract.",
    [{ path: "$.exports[0]", failure: "First failure." }],
  );
  const repeated = dotnetExtensionDiagnostic(
    "example.provider",
    "EXAMPLE_CONTRACT_INVALID",
    9200000,
    "Invalid provider contract.",
    [{ failure: "First failure.", path: "$.exports[0]" }],
  );
  const distinct = dotnetExtensionDiagnostic(
    "example.provider",
    "EXAMPLE_CONTRACT_INVALID",
    9200000,
    "Invalid provider contract.",
    [{ path: "$.exports[1]", failure: "Second failure." }],
  );

  assert.equal(first.identity, repeated.identity);
  assert.notEqual(first.identity, distinct.identity);
  assert.match(first.identity, /^[0-9a-f]{64}$/u);
  assert.match(distinct.identity, /^[0-9a-f]{64}$/u);
});
