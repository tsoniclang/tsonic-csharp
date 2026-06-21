import { test } from "node:test";
import assert from "node:assert/strict";
import { planTypeParameters } from "../dist/backend/planner/type-parameters.js";
import { KindIdentifier } from "../dist/backend/planner/source-ast.js";
import { isCsharpThrowableCarrier } from "../dist/backend/planner/statement-output.js";
import { printCsharpType } from "../dist/print/csharp-printer.js";
import { csharpTargetTypeParameterConstraintFactKey } from "../dist/source/csharp-facts.js";
import { csharpTargetNamedType } from "../dist/source/csharp-source-semantics/target-types.js";

test("throwable carriers require explicit C# target capability metadata", () => {
  assert.equal(isCsharpThrowableCarrier({ kind: "target-named", id: "System.Exception" }), false);
  assert.equal(isCsharpThrowableCarrier(csharpTargetNamedType("System.Exception")), true);
});

test("type parameter constraints render finalized C# type facts", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "csharp-type",
        type: csharpTargetNamedType("System.Numerics.INumber`1", [{ kind: "type-parameter", name: "T" }]),
      }],
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].name, "T");
  assert.equal(parameters[0].constraints.length, 1);
  assert.equal(printCsharpType(parameters[0].constraints[0]), "System.Numerics.INumber<T>");
});

test("type parameter constraints reject old target-specific mini protocols", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "target-specific",
        target: "csharp",
        name: "generic-math-number",
      }],
    },
  }), diagnostics);

  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].constraints, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /does not support target type-parameter constraint 'csharp:generic-math-number'/);
});

function typeParameterNode(name) {
  return {
    Kind: "KindTypeParameter",
    name: { Kind: KindIdentifier, Text: name },
  };
}

function fakeInput(options) {
  return {
    ast: {
      kindName: (node) => String(node?.Kind),
      kindNameFromKind: (kind) => String(kind),
    },
    facts: {
      getFact: (subject, key) =>
        subject === options.subject && key === csharpTargetTypeParameterConstraintFactKey
          ? options.constraintFact
          : undefined,
    },
  };
}
