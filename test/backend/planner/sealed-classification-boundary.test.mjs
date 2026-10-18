import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readCsharpConversionClassification,
} from "../../../dist/backend/planner/expressions/conversions.js";
import {
  translateCsharpCallExpression,
} from "../../../dist/backend/planner/expressions/target-members/selected-call/entry.js";

test("C# call planning fails closed when its sealed classification is absent", () => {
  const node = {};
  const diagnostics = [];
  const input = {
    program: { source: {
        ast: {
          as: {
            AsCallExpression(subject) {
              assert.equal(subject, node);
              return { Expression: {} };
            },
          },
        },
      },
      records: { selectedCall: { get(subject) {
          assert.equal(subject, node);
          return undefined;
        } } } },
  };

  const result = translateCsharpCallExpression(
    node,
    {},
    input,
    diagnostics,
    () => assert.fail("planning must stop before recursively planning the call"),
    () => assert.fail("planning must stop before planning arguments"),
  );

  assert.equal(result, undefined);
  assert.deepEqual(diagnostics, [{
    code: "CSHARP_TARGET_CALL_CLASSIFICATION_MISSING",
    category: "error",
    source: "tsonic-csharp",
    message: "C# planning received a call without a sealed target classification.",
    sourceNode: node,
  }]);
});

test("C# conversion planning fails closed when its sealed classification is absent", () => {
  const node = {};
  const diagnostics = [];
  const input = {
    program: { records: { conversion: { get() {
          return undefined;
        } } } },
  };

  assert.throws(() => readCsharpConversionClassification(
    node,
    input,
    diagnostics,
    { kind: "source-primitive", name: "int32" },
    { kind: "source-primitive", name: "float64" },
    "implicit",
  ), error => error instanceof Error && error.phase === "planning" &&
    error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" &&
    error.diagnostic.source === "tsonic-csharp" && error.diagnostic.sourceNode === node &&
    error.message === "C# planning requires a sealed target conversion classification that analysis did not produce.",
  "a corrupted sealed conversion record uses the registered planner-invariant route");
  assert.equal(diagnostics.length, 0, "an impossible missing record is not relabelled as a source diagnostic");
});
