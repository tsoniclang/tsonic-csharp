import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { planCsharpRuntimeUnionProjection } from "../../../../dist/backend/planner/expressions/runtime-union-projections.js";
import { csharpRuntimeUnionProjectionMatches } from "../../../../dist/analysis/conversions/validation.js";

test("nullable union projections require exact payload and absence facts", () => {
  const string = csharpStringTargetType();
  const integer = csharpSourcePrimitiveTargetType("int32");
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const source = csharpNullableTargetType(union);
  const target = csharpNullableTargetType(string);
  const input = { kind: "IdentifierName", name: "value" };
  const selection = { kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: true };
  const diagnostics = [];
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined } };
  const context = { scope: { typeParameterNames: new Map() }, program: { conversions: {
    matchesUnionProjection: (source, target, selection) => csharpRuntimeUnionProjectionMatches(policy, source, target, selection),
  } } };
  const projected = planCsharpRuntimeUnionProjection({}, source, target, selection, input, diagnostics, context);
  assertNoTargetDiagnostics(diagnostics);
  assert.deepEqual(projected, { kind: "InvocationExpression", callee: { kind: "ConditionalAccessExpression", receiver: input, name: "As2" }, arguments: [] });
  for (const [selectedSource, selectedTarget, selected] of [
    [union, target, selection], [source, string, selection], [source, target, { ...selection, retainsAbsence: false }],
    [source, target, { ...selection, retainsAbsence: undefined }], [source, target, { ...selection, path: [{ union, index: 0 }] }],
    [source, target, { ...selection, armType: integer }], [source, target, { ...selection, path: [{ union, index: "1" }] }],
    [source, target, { ...selection, path: [] }], [source, target, { ...selection, path: new Array(1) }],
  ]) {
    diagnostics.length = 0;
    assert.equal(planCsharpRuntimeUnionProjection({}, selectedSource, selectedTarget, selected, input, diagnostics, context), undefined);
    assert.equal(diagnostics.length, 1);
  }
});
