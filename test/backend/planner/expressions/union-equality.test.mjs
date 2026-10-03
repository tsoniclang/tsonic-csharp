import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpUnionEquality } from "../../../../dist/policy/operations/operators/union-equality.js";
import { planCsharpUnionEquality } from "../../../../dist/backend/planner/expressions/union-equality.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { printCsharpExpression } from "../../../../dist/print/source/printer.js";

test("union equality rejects stale carriers, paths, operations, coverage and polarity", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const policy = { providers: { findTargetBindingByTargetId() {} }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const arms = selectCsharpUnionEquality(union, string, policy);
  const operation = { kind: "union-equality", negated: false, arms };
  const selection = { kind: "resolved", sourceOperator: "===", targetOperation: operation,
    left: {}, right: {}, leftType: union, rightType: string, resultType: csharpSourcePrimitiveTargetType("bool") };
  const input = { program: { operations: { binary: () => ({ target: selection }) } }, scope: {} };
  const diagnostics = [];
  const state = () => ({ nextTempIndex: 0, usedNames: new Set() });
  const plan = () => ({ kind: "IdentifierName", name: "operand" });
  const planned = planCsharpUnionEquality({}, selection, {}, input, diagnostics, plan, state());
  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression.elements.length, 2);
  for (const mutation of [
    { left: {} }, { leftType: string }, { rightType: integer }, { resultType: integer },
    { sourceOperator: "!==" },
    ...[undefined, null, [], [null], [{ ...arms[0], left: null }], [{ ...arms[0], operation: null }],
      [{ ...arms[0], operation: { kind: "operator" } }],
      [...arms, arms[0]], [{ ...arms[0], left: { ...arms[0].left, path: [] } }],
      [{ ...arms[0], operation: { kind: "reference-identity", negated: false } }]].map(arms =>
      ({ targetOperation: { ...operation, arms } })),
    { targetOperation: { ...operation, negated: true } },
  ]) {
    diagnostics.length = 0;
    assert.equal(planCsharpUnionEquality({}, { ...selection, ...mutation }, {}, input, diagnostics, () => {
      assert.fail("invalid classification cannot plan operands");
    }, state()), undefined);
    assert.equal(diagnostics.length, 1);
  }
});

test("nullable union equality plans canonical native presence guards with each operand evaluated once in order", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const text = csharpStringTargetType();
  const base = csharpTargetNamedType("fixture.Base", [], { kind: "named", name: "Base" }, { sourceDeclarationKind: "class" });
  const policy = { providers: { findTargetBindingByTargetId() {} }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const union = csharpNullableTargetType(csharpRuntimeUnionTargetType([integer, text, base]));
  for (const rightType of [union, csharpNullableTargetType(text), csharpNullableTargetType(base), integer]) {
    const arms = selectCsharpUnionEquality(union, rightType, policy);
    assert.ok(arms !== undefined);
    for (const negated of [false, true]) {
      const left = {};
      const right = {};
      const selection = { kind: "resolved", sourceOperator: negated ? "!==" : "===",
        targetOperation: { kind: "union-equality", negated, arms }, left, right, leftType: union, rightType,
        resultType: csharpSourcePrimitiveTargetType("bool") };
      const input = { program: { operations: { binary: () => ({ target: selection }) } }, scope: {} };
      const seen = [];
      const diagnostics = [];
      const planned = planCsharpUnionEquality({}, selection, {}, input, diagnostics, node => {
        seen.push(node);
        return { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: node === left ? "produceLeft" : "produceRight" }, arguments: [] };
      }, { nextTempIndex: 0, usedNames: new Set() });
      assert.deepEqual(diagnostics, []);
      assert.deepEqual(seen, [left, right]);
      const output = printCsharpExpression(planned);
      assert.equal(output.match(/produceLeft\(\)/gu)?.length, 1);
      assert.equal(output.match(/produceRight\(\)/gu)?.length, 1);
      assert.ok(output.indexOf("produceLeft()") < output.indexOf("produceRight()"));
      assert.match(output, /\.Item1\?\.Is\d\(\) == true/u);
      assert.match(output, /\.Item1!\.Value\.As\d\(\)/u);
      if (rightType !== integer) assert.match(output, /\.Item1 is null.*\.Item2 is null/u);
      if (rightType !== union && rightType !== integer) assert.match(output, /\.Item2 is (?:string|Base) /u);
      assert.doesNotMatch(output, /\bnew\b|\bClone\b|\bDynamicInvoke\b|\(object\)|\.ToArray\(|\.ToList\(/u);
      if (negated) assert.match(output, /^!/u);
      for (const mutation of [
        { leftType: csharpRuntimeUnionTargetType([integer, text, base]) },
        { targetOperation: { ...selection.targetOperation, arms: arms.slice(0, -1) } },
      ]) {
        assert.equal(planCsharpUnionEquality({}, { ...selection, ...mutation }, {}, input, [],
          () => assert.fail("stale absence evidence cannot evaluate operands"),
          { nextTempIndex: 0, usedNames: new Set() }), undefined);
      }
    }
  }
});
