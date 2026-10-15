import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpUnionEquality } from "../../../dist/policy/operations/operators/union-equality.js";
import { csharpAbsenceTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType } from "../../../dist/target-model/types/index.js";
import { csharpUnionEqualityArmsEqual } from "../../../dist/target-model/operations/binary.js";
import { selectCsharpBinaryOperands } from "../../../dist/policy/operations/operators/operator-selection.js";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

test("union equality covers nested leaf pairs without inventing operations for opaque types", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const text = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const inner = csharpRuntimeUnionTargetType([integer, text]);
  const outer = csharpRuntimeUnionTargetType([inner, boolean]);
  const input = { providers: { findTargetBindingByTargetId() {} }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const selected = selectCsharpUnionEquality(outer, outer, input);
  assert.equal(selected.length, 3);
  assert.deepEqual(selected.map(arm => arm.left.path.map(step => step.index)), [[0, 0], [0, 1], [1]]);
  assert.ok(Object.isFrozen(selected) && selected.every(arm => Object.isFrozen(arm) && Object.isFrozen(arm.operation)));
  assert.ok(csharpUnionEqualityArmsEqual(selected, selectCsharpUnionEquality(outer, outer, input)));
  for (const other of [undefined, [], selected.toReversed(), [...selected, selected[0]],
    [{ ...selected[0], left: { ...selected[0].left, path: [] } }, ...selected.slice(1)],
    [{ ...selected[0], operation: { kind: "operator", leftInputType: text, rightInputType: text } }, ...selected.slice(1)]]) {
    assert.equal(csharpUnionEqualityArmsEqual(selected, other), false);
  }
  assert.throws(() => { selected[0].operation.kind = "reference-identity"; }, TypeError);
  assert.equal(selectCsharpUnionEquality(outer, { kind: "type-parameter", identity: "opaque", name: "Opaque" }, input), undefined);
  assert.equal(selectCsharpUnionEquality(integer, text, input), undefined);
});

test("nullable union equality selects native presence and absence independently of source typeof", () => {
  const base = csharpTargetNamedType("fixture.Base", [], { kind: "named", name: "Base" }, { sourceDeclarationKind: "class" });
  const derived = csharpTargetNamedType("fixture.Derived", [], { kind: "named", name: "Derived" }, { sourceDeclarationKind: "class" });
  const text = csharpStringTargetType();
  const absent = csharpAbsenceTargetType();
  const registry = createCsharpTypeDefinitionRegistry();
  const authored = csharpSourceUnionTargetType("fixture.Union", "Union", []);
  assert.equal(registry.registerSourceUnion({ carrier: authored, arms: [text, base] }), true);
  const definitions = registry.seal();
  const input = { typeDefinitions: definitions,
    providers: { findTargetBindingByTargetId() {} },
    objectShapes: { resolveTarget: carrier => [base, derived].some(value => targetTypeRefEquals(value, carrier)) ? {} : undefined },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  for (const union of [csharpRuntimeUnionTargetType([text, base]), authored]) {
    const nullable = csharpNullableTargetType(union);
    const same = selectCsharpUnionEquality(nullable, nullable, input);
    assert.equal(same.length, 3);
    assert.deepEqual(same.map(arm => [arm.left.path.length, arm.right.path.length]), [[1, 1], [1, 1], [0, 0]]);
    assert.equal(same[2].operation.kind, "reference-identity");
    assert.ok(targetTypeRefEquals(same[2].left.carrier, absent));
    for (const [left, right] of [[nullable, derived], [derived, nullable]]) {
      const selected = selectCsharpUnionEquality(left, right, input);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].operation.kind, "reference-identity");
      assert.ok(!selected.some(arm => targetTypeRefEquals(arm.left.carrier, absent) || targetTypeRefEquals(arm.right.carrier, absent)));
    }
    const nullableReference = selectCsharpUnionEquality(nullable, csharpNullableTargetType(derived), input);
    assert.equal(nullableReference.length, 2);
    assert.equal(nullableReference[1].left.path.length, 0);
    assert.equal(nullableReference[1].right.path.length, 0);
    const nullableText = selectCsharpUnionEquality(nullable, csharpNullableTargetType(text), input);
    assert.equal(nullableText.length, 2);
    assert.equal(nullableText[0].operation.kind, "operator");
    assert.equal(selectCsharpUnionEquality(nullable, absent, input).length, 1);
    assert.equal(selectCsharpUnionEquality(nullable, { kind: "type-parameter", identity: "opaque", name: "Opaque" }, input), undefined);
  }
});

test("nullable union equality enters the existing binary owner and preserves incompatible native widths", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const unsigned = csharpSourcePrimitiveTargetType("uint64");
  const text = csharpStringTargetType();
  const carrier = csharpNullableTargetType(csharpRuntimeUnionTargetType([integer, text]));
  const policy = { providers: { findTargetBindingByTargetId() {} }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  assert.equal(selectCsharpUnionEquality(carrier, unsigned, policy), undefined);
  assert.equal(selectCsharpUnionEquality(carrier, csharpNullableTargetType(unsigned), policy), undefined);
  const stringUnion = csharpNullableTargetType(csharpRuntimeUnionTargetType([text, csharpSourcePrimitiveTargetType("bool")]));
  const left = {};
  const right = {};
  const input = { ...policy, ast: { is: { IsBinaryExpression: () => false, IsObjectLiteralExpression: () => false,
    IsArrayLiteralExpression: () => false, IsStringLiteral: () => false, IsNoSubstitutionTemplateLiteral: () => false },
    kindName: () => "KindIdentifier" }, types: { resolveReadStorage: () => undefined } };
  for (const sourceOperator of ["===", "!=="]) {
    const selected = selectCsharpBinaryOperands(input, left, right, sourceOperator,
      csharpSourcePrimitiveTargetType("bool"), node => node === left ? stringUnion : text);
    assert.equal(selected.kind, "resolved");
    assert.equal(selected.targetOperation.kind, "union-equality");
    assert.equal(selected.targetOperation.negated, sourceOperator === "!==");
    assert.ok(targetTypeRefEquals(selected.leftType, stringUnion));
    assert.ok(targetTypeRefEquals(selected.leftInputType, stringUnion));
  }
});
