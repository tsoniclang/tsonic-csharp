import assert from "node:assert/strict";
import test from "node:test";
import {
  planRegularExpressionLiteral,
} from "../../../dist/backend/planner/expressions/regular-expression-literals.js";
import {
  csharpJsRegExpTargetType,
} from "../../../dist/policy/types/index.js";
import { selectCsharpRegularExpressionLiteral } from "../../../dist/analysis/operations/syntax/regexp-literal.js";
import {
  printCsharpExpression,
} from "../../../dist/print/source/index.js";

test("RegExp literal emission consumes the direct JS-surface policy selection", () => {
  const node = regexpNode("provider[/-]pattern", "im");
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(
    node,
    directInput(node, csharpJsRegExpTargetType()),
    diagnostics,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(
    printCsharpExpression(expression),
    'new Tsonic.CSharp.Js.RegExp("provider[/-]pattern", "im")',
  );
});

test("RegExp literal emission fails closed without the explicit JS target relation", () => {
  const node = regexpNode("value", "g");
  const diagnostics = [];
  const input = directInput(node, undefined);
  // The operation analysis selects the refusal (and reports it before sealing); the planner never plans it.
  assert.equal(input.program.records.regularExpression.get(node).kind, "rejected");
  assert.equal(input.program.records.regularExpression.get(node).code, "CSHARP_JS_REGEXP_TARGET_NOT_PROVEN");
  assert.throws(() => planRegularExpressionLiteral(node, input, diagnostics), error => error instanceof Error &&
    error.phase === "planning" && error.message === "A rejected regular-expression literal cannot reach planning.");
  assert.deepEqual(diagnostics, []);
});

test("RegExp literal emission preserves complete ECMAScript syntax for the runtime", () => {
  const node = regexpNode("(?<name>a)", "g");
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(
    node,
    directInput(node, csharpJsRegExpTargetType()),
    diagnostics,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(
    printCsharpExpression(expression),
    'new Tsonic.CSharp.Js.RegExp("(?<name>a)", "g")',
  );
});

function regexpNode(pattern, flags) {
  return {
    kind: "regexp",
    syntax: { pattern, flags },
  };
}

function directInput(node, targetType) {
  const selection = selectCsharpRegularExpressionLiteral(
    {
      ast: {
        regularExpressionLiteral: (candidate) =>
          candidate === node ? node.syntax : undefined,
      },
      // CsharpTypeQueries.value: the represented Host value type of the literal (nextgen C-2542, I6).
      types: {
        value: (candidate) => candidate === node ? targetType : assert.fail("only the literal value is represented"),
      },
    },
    node,
  );
  return {
    scope: {},
    program: { records: { regularExpression: { get: (candidate) =>
          candidate === node ? selection : undefined } } },
  };
}
