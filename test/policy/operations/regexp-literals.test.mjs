import assert from "node:assert/strict";
import test from "node:test";
import {
  planRegularExpressionLiteral,
} from "../../../dist/backend/planner/expressions/regular-expression-literals.js";
import {
  csharpJsRegExpTargetType,
} from "../../../dist/policy/types/index.js";
import {
  printCsharpExpression,
} from "../../../dist/print/source/index.js";

test("RegExp literal emission consumes the direct JS-surface policy selection", () => {
  const node = regexpNode("/provider[/-]pattern/im");
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(
    node,
    {},
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
  const node = regexpNode("/value/g");
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(
    node,
    {},
    directInput(node, undefined),
    diagnostics,
  );

  assert.equal(expression, undefined);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "CSHARP_JS_REGEXP_TARGET_NOT_PROVEN",
  ]);
});

test("RegExp literal emission rejects unsupported source semantics before C# AST construction", () => {
  const node = regexpNode("/(?<name>a)/g");
  const diagnostics = [];
  const expression = planRegularExpressionLiteral(
    node,
    {},
    directInput(node, csharpJsRegExpTargetType()),
    diagnostics,
  );

  assert.equal(expression, undefined);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "CSHARP_JS_REGEXP_UNSUPPORTED",
  ]);
  assert.match(diagnostics[0].message, /Named capture/u);
});

function regexpNode(text) {
  return { kind: "regexp", text };
}

function directInput(node, targetType) {
  return {
    policy: {
      ast: {
        is: {
          IsRegularExpressionLiteral: (candidate) => candidate === node,
        },
        text: (candidate) => candidate?.text ?? "",
      },
      types: {
        resolveNode: (candidate) =>
          candidate === node ? targetType : undefined,
      },
    },
  };
}
