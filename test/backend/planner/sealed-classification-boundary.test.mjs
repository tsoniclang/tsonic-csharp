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
    program: {
      source: {
        ast: {
          as: {
            AsCallExpression(subject) {
              assert.equal(subject, node);
              return { Expression: {} };
            },
          },
        },
      },
      operations: {
        call(subject) {
          assert.equal(subject, node);
          return undefined;
        },
      },
    },
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
    program: {
      conversions: {
        select() {
          return undefined;
        },
      },
    },
  };

  const result = readCsharpConversionClassification(
    node,
    input,
    diagnostics,
    { kind: "source-primitive", name: "int32" },
    { kind: "source-primitive", name: "float64" },
    "implicit",
  );

  assert.equal(result, undefined);
  assert.deepEqual(diagnostics, [{
    code: "CSHARP_UNSUPPORTED_AST",
    category: "error",
    source: "tsonic-csharp",
    message:
      "C# planning requires a sealed target conversion classification that analysis did not produce.",
    sourceNode: node,
  }]);
});
