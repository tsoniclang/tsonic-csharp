import assert from "node:assert/strict";
import test from "node:test";
import {
  planRegularExpressionLiteral,
} from "../../../dist/backend/planner/expressions/regular-expression-literals.js";
import {
  csharpJsRegExpTargetType,
} from "../../../dist/policy/types/index.js";
import {
  selectCsharpRegularExpressionLiteral,
} from "../../../dist/policy/operations/index.js";
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
  const expression = planRegularExpressionLiteral(
    node,
    directInput(node, undefined),
    diagnostics,
  );

  assert.equal(expression, undefined);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "CSHARP_JS_REGEXP_TARGET_NOT_PROVEN",
  ]);
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
  const sourceFile = {};
  const selection = selectCsharpRegularExpressionLiteral(
    {
      ast: {
        regularExpressionLiteral: (candidate) =>
          candidate === node ? node.syntax : undefined,
      },
      types: {
        resolveNode: (candidate) =>
          candidate === node ? targetType : undefined,
      },
    },
    node,
    sourceFile,
  );
  return {
    program: {
      operations: {
        regularExpression: (candidate) =>
          candidate === node ? selection : undefined,
      },
    },
  };
}
