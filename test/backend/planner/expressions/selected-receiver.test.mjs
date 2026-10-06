import assert from "node:assert/strict";
import test from "node:test";
import { translateCsharpSelectedReceiver } from "../../../../dist/backend/planner/expressions/receivers.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/scalar-types.js";
import { csharpNullableReferenceTargetType } from "../../../../dist/target-model/types/nullable.js";

const instanceInput = { program: { sourceNavigation: {
  sourceReferenceFor: () => undefined, referenceFor: () => undefined,
} } };

function projectReceiver(kind, scopeName = "ModuleScope") {
  const expression = {};
  const declaration = {};
  const name = {};
  const file = { IsDeclarationFile: false };
  const carrier = csharpStringTargetType();
  const input = {
    program: {
      sourceNavigation: { referenceFor: () => ({ declaration, sourceFile: file }),
        sourceReferenceFor: () => ({ declaration, sourceFile: file }),
        isProjectDeclaration: candidate => candidate === declaration },
      source: { ast: { kindName: () => kind, name: () => name, getFileName: () => "/project/entry.ts",
        is: { IsClassExpression: () => false } } },
      classFactories: { get: () => undefined },
    },
    types: { classifications: { resolveNode: () => carrier },
      projectTypes: { definitionContainingDeclaration: () => ({ scopeName }) } },
    names: { resolve: () => ({ kind: "resolved", name: "Entry" }) },
  };
  return { expression, declaration, file, carrier, input };
}

test("project class and enum receivers consume the exact module qualification without acquiring constructor delegates", () => {
  for (const kind of ["KindClassDeclaration", "KindEnumDeclaration"]) {
    const { expression, file, carrier, input } = projectReceiver(kind);
    const diagnostics = [];
    const result = translateCsharpSelectedReceiver({ expression, type: {} }, file, input, diagnostics,
      () => assert.fail("native type references are not runtime constructor acquisition"));
    assert.equal(result === undefined, false, kind);
    assert.equal(result.completion.carrier === carrier, true, "exact retained value evidence");
    assert.deepEqual(result.completion.expression,
      { kind: "QualifiedName", left: { kind: "IdentifierName", name: "ModuleScope" }, name: "Entry" });
    assert.equal(result.prelude.length, 0, "no allocation or receiver evaluation");
    assert.equal(diagnostics.length, 0, kind);
  }
});

test("constructed instance receivers never become static references merely because their type has a class declaration", () => {
  const { expression, file, carrier, input } = projectReceiver("KindClassDeclaration");
  input.program.sourceNavigation.sourceReferenceFor = () => undefined;
  const planned = csharpPlannedValue(carrier, { kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name: "construct" }, arguments: [] });
  let evaluations = 0;
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression, type: {} }, file, input, diagnostics, selected => {
    assert.equal(selected === expression, true);
    evaluations += 1;
    return planned;
  });
  assert.equal(result === planned, true, "the constructed receiver and its effects remain intact");
  assert.equal(evaluations, 1);
  assert.equal(diagnostics.length, 0);
});

test("checked receiver value identity supports transparent syntax without reconstructing the checker", () => {
  const { expression, declaration, file, input } = projectReceiver("KindClassDeclaration");
  input.program.sourceNavigation.sourceReferenceFor = () => undefined;
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression, type: {}, valueDeclaration: declaration }, file, input, diagnostics,
    () => assert.fail("parenthesized type syntax is not runtime factory acquisition"));
  assert.equal(result === undefined, false);
  assert.equal(result.completion.expression.kind, "QualifiedName");
  assert.equal(diagnostics.length, 0);
  const rejected = translateCsharpSelectedReceiver({ expression, type: {}, valueDeclaration: {} }, file, input, diagnostics,
    () => csharpPlannedValue(csharpStringTargetType(), { kind: "IdentifierName", name: "actualValue" }));
  assert.equal(rejected.completion.expression.kind, "IdentifierName", "mismatched exact declarations cannot select static syntax");
});

test("project type receivers never bypass missing or rejected selected carrier evidence", () => {
  const { expression, file, carrier, input } = projectReceiver("KindClassDeclaration");
  for (const [label, types, projection] of [
    ["missing native carrier", { ...input.types, classifications: { resolveNode: () => undefined } }, undefined],
    ["rejected receiver projection", input.types,
      { source: csharpNullableReferenceTargetType(carrier), target: carrier,
        conversion: { kind: "rejected", reason: "missing selected proof" } }],
  ]) {
    const diagnostics = [];
    const result = translateCsharpSelectedReceiver({ expression, type: {} }, file, { ...input, types }, diagnostics,
      () => assert.fail("no speculative constructor acquisition"), projection);
    assert.equal(result === undefined, true, label);
    assert.equal(diagnostics.length, 1, label);
  }
});

test("local class factories remain exact runtime receiver values rather than namespace references", () => {
  const { expression, file, carrier, input } = projectReceiver("KindClassDeclaration");
  input.program.classFactories.get = () => ({});
  const planned = csharpPlannedValue(carrier, { kind: "IdentifierName", name: "selectedFactory" });
  let evaluations = 0;
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression, type: {} }, file, input, diagnostics, selected => {
    assert.equal(selected === expression, true);
    evaluations += 1;
    return planned;
  });
  assert.equal(result === planned, true, "the owning factory contract remains authoritative");
  assert.equal(evaluations, 1);
  assert.equal(diagnostics.length, 0);
});

test("selected receiver projections consume an already-selected planned value exactly once", () => {
  const selected = csharpStringTargetType();
  const storage = csharpNullableReferenceTargetType(selected);
  const node = {};
  const value = { kind: "PostfixUnaryExpression", operatorToken: { kind: "ExclamationToken" },
    operand: { kind: "IdentifierName", name: "selected" } };
  const prelude = [{ kind: "ExpressionStatement", expression: { kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name: "effect" }, arguments: [] } }];
  const planned = csharpPlannedValue(selected, value, prelude);
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression: node, type: {} }, {}, instanceInput, diagnostics,
    () => planned, { source: storage, target: selected, conversion: { kind: "nullable-reference" } });
  assert.equal(result === planned, true, "no second null suppression or duplicated effects");
  assert.equal(result.prelude.length, 1);
  assert.equal(diagnostics.length, 0);
});

test("selected receiver projections reject an unrelated planned carrier rather than applying a stale conversion", () => {
  const selected = csharpStringTargetType();
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression: {}, type: {} }, {}, instanceInput, diagnostics,
    () => csharpPlannedValue(csharpSourcePrimitiveTargetType("int32"), { kind: "LiteralExpression", value: 1 }),
    { source: csharpNullableReferenceTargetType(selected), target: selected, conversion: { kind: "nullable-reference" } });
  assert.equal(result === undefined, true);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /exact planned completion carrier/u);
});

test("selected receiver projections never hide rejected evidence behind an already-selected carrier", () => {
  const selected = csharpStringTargetType();
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression: {}, type: {} }, {}, instanceInput, diagnostics,
    () => csharpPlannedValue(selected, { kind: "IdentifierName", name: "value" }),
    { source: csharpNullableReferenceTargetType(selected), target: selected,
      conversion: { kind: "rejected", reason: "missing selected proof" } });
  assert.equal(result === undefined, true);
  assert.equal(diagnostics.length, 1);
});
