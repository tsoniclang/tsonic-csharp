import { test } from "node:test";
import assert from "node:assert/strict";
import { planRegularExpressionLiteral } from "../dist/backend/planner/regular-expression-literals.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";
import {
  csharpRegularExpressionLiteralFactKey,
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";

test("regexp literal emission uses provider facts without backend target-id hardcoding", () => {
  const node = { Kind: "KindRegularExpressionLiteral", Text: "/backend-must-not-read-this/g" };
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(node, {}, fakeInput({
    subject: node,
    literal: {
      pattern: "provider[/-]pattern",
      flags: "im",
    },
    operation: {
      kind: "member",
      operationId: "acme.regex.literal.constructor",
      operationKind: "constructor",
      memberName: "Regex",
      resultType: {
        kind: "target-named",
        id: "Acme.Runtime.Regex",
        csharpRender: { kind: "named", namespace: ["Acme", "Runtime"], name: "Regex" },
      },
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "new Acme.Runtime.Regex(\"provider[/-]pattern\", \"im\")");
});

test("regexp literal emission requires provider literal facts", () => {
  const node = { Kind: "KindRegularExpressionLiteral", Text: "/value/g" };
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(node, {}, fakeInput({
    subject: node,
    operation: {
      kind: "member",
      operationId: "acme.regex.literal.constructor",
      operationKind: "constructor",
      memberName: "Regex",
      resultType: {
        kind: "target-named",
        id: "Acme.Runtime.Regex",
        csharpRender: { kind: "named", namespace: ["Acme", "Runtime"], name: "Regex" },
      },
    },
  }), diagnostics);

  assert.equal(expression.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires finalized provider pattern and flags facts/);
});

test("regexp literal emission requires a renderable provider constructor result type", () => {
  const node = { Kind: "KindRegularExpressionLiteral", Text: "/value/g" };
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(node, {}, fakeInput({
    subject: node,
    literal: {
      pattern: "value",
      flags: "g",
    },
    operation: {
      kind: "member",
      operationId: "acme.regex.literal.constructor",
      operationKind: "constructor",
      memberName: "Regex",
      resultType: {
        kind: "target-named",
        id: "Acme.Runtime.Regex",
      },
    },
  }), diagnostics);

  assert.equal(expression.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a renderable provider constructor result type fact/);
});

function fakeInput(options) {
  return {
    facts: {
      getFact: (subject, key) => {
        if (subject !== options.subject) {
          return undefined;
        }
        if (key === csharpRegularExpressionLiteralFactKey) {
          return options.literal;
        }
        if (key === csharpTargetOperationFactKey) {
          return options.operation;
        }
        return undefined;
      },
    },
  };
}
