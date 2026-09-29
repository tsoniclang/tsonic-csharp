import assert from "node:assert/strict";
import test from "node:test";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { planCsharpRuntimeUnionProjection } from "../../../../dist/backend/planner/expressions/runtime-union-projections.js";

test("nullable union projections require exact payload and absence facts", () => {
  const string = csharpStringTargetType();
  const integer = csharpSourcePrimitiveTargetType("int32");
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const source = csharpNullableTargetType(union);
  const target = csharpNullableTargetType(string);
  const input = { kind: "IdentifierName", name: "value" };
  const selection = { kind: "runtime-union-projection", armIndex: 1, armType: string, retainsAbsence: true };
  const diagnostics = [];
  const projected = planCsharpRuntimeUnionProjection({}, source, target, selection, input, diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(projected, { kind: "InvocationExpression", callee: { kind: "ConditionalAccessExpression", receiver: input, name: "As2" }, arguments: [] });
  for (const [selectedSource, selectedTarget, selected] of [
    [union, target, selection], [source, string, selection], [source, target, { ...selection, retainsAbsence: false }],
    [source, target, { ...selection, retainsAbsence: undefined }], [source, target, { ...selection, armIndex: 0 }],
    [source, target, { ...selection, armType: integer }], [source, target, { ...selection, armIndex: "1" }],
  ]) {
    diagnostics.length = 0;
    assert.equal(planCsharpRuntimeUnionProjection({}, selectedSource, selectedTarget, selected, input, diagnostics), undefined);
    assert.equal(diagnostics.length, 1);
  }
});
