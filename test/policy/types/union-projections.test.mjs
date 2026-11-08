import assert from "node:assert/strict";
import test from "node:test";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpUnionProjectionPath } from "../../../dist/policy/conversions/union-relations.js";
import { selectCsharpRuntimeUnionProjection } from "../../../dist/policy/conversions/carriers.js";
import { csharpRuntimeUnionProjectionMatches } from "../../../dist/analysis/conversions/validation.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";

test("nested union payload paths are exact, immutable and independently checked", () => {
  const integer = csharpSourcePrimitiveTargetType("uint64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const inner = csharpRuntimeUnionTargetType([integer, string]);
  const nested = csharpRuntimeUnionTargetType([boolean, inner]);
  const path = csharpUnionProjectionPath(nested, integer);
  assert.deepEqual(path, [{ union: nested, index: 1 }, { union: inner, index: 0 }]);
  assert.ok(Object.isFrozen(path) && path.every(Object.isFrozen));
  const policy = createNativeConversionHost();
  const selected = selectCsharpRuntimeUnionProjection(policy, nested, integer);
  assert.deepEqual(selected, { kind: "runtime-union-projection", path, armType: integer, retainsAbsence: false });
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, nested, integer, selected), true);
  const accessor = { get union() { assert.fail("untrusted path getters must not run"); }, index: 0 };
  for (const changedPath of [[], path.slice(1), path.toReversed(), new Array(2), [...path, path[0]],
    [path[0], { ...path[1], union: nested }], [path[0], { ...path[1], index: 1 }], [path[0], accessor],
    [path[0], { ...path[1], extra: true }]]) {
    assert.equal(csharpRuntimeUnionProjectionMatches(policy, nested, integer, { ...selected, path: changedPath }), false);
  }
  const signed = csharpSourcePrimitiveTargetType("int64");
  assert.equal(csharpUnionProjectionPath(nested, signed), undefined);
  const optional = csharpNullableTargetType(integer);
  const optionalProjection = selectCsharpRuntimeUnionProjection(policy, nested, optional);
  assert.deepEqual(optionalProjection, { kind: "runtime-union-projection", path, armType: integer, retainsAbsence: false });
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, nested, optional, optionalProjection), true);
  assert.equal(selectCsharpRuntimeUnionProjection(policy, nested, csharpNullableTargetType(signed)).kind, "rejected",
    "absence injection cannot change native width or signedness");
  assert.equal(csharpUnionProjectionPath(csharpRuntimeUnionTargetType([integer, inner]), integer), undefined);
  const nominal = csharpTargetNamedType("fixture.Cycle", [], { kind: "named", name: "Cycle" },
    { allowsRefLikeTypeArguments: [] });
  assert.equal(csharpUnionProjectionPath(nominal, integer), undefined,
    "an opaque nominal carrier cannot become a union through a second Source-arm registry");
});

test("checked member evidence survives exact union projection without relaxing path or payload checks", () => {
  let reads = 0;
  const checked = checkCsharpSource({ sourceText: 'import type { uint64 } from "@tsonic/core/types.js"; export interface Payload { readonly value: uint64; }' });
  assertCsharpCheckingSucceeded(checked);
  const file = checked.source.sourceFiles.find(file => !checked.source.ast.isDeclarationFile(file));
  const declaration = checked.source.ast.statements(file).find(node => checked.source.ast.is.IsInterfaceDeclaration(node));
  const identity = checked.source.ast.members(declaration)[0];
  assert.equal(identity !== undefined, true, "the original declaration Node is genuine Source evidence, not a raw checked Type");
  const payload = { kind: "target-named", id: "test.EvidencePayload", csharpAllowsRefLikeTypeArguments: [] };
  const shape = { targetType: payload, members: [{ sourceKey: { kind: "property", name: "value" },
    sourceName: "value", targetName: "value", memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64"),
    readonly: true, origins: [{ kind: "declared", declaration: identity }],
    sourceSubjects: [identity], sourceDeclarations: [identity] }] };
  const union = csharpRuntimeUnionTargetType([payload, csharpStringTargetType()], [shape, undefined]);
  const policy = createNativeConversionHost();
  const selected = selectCsharpRuntimeUnionProjection(policy, union, payload);
  assert.equal(selected.kind, "runtime-union-projection", "the original native payload has one exact projection");
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, union, payload, selected), true,
    "valid checked member metadata cannot make a path disagree with itself");
  const [snapshot] = snapshotCsharpTargetTypes([union]);
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, snapshot, payload, selected), true, "immutable roundtrip retains the same projection");
  const retained = snapshot.csharpRuntimeUnionObjectShapes[0];
  assert.equal(retained.members[0].sourceSubjects[0] === identity && retained.members[0].sourceDeclarations[0] === identity &&
    retained.members[0].origins[0].declaration === identity && retained.members[0].readonly === true &&
    retained.members[0].type.kind === "source-primitive" && retained.members[0].type.name === "uint64", true,
    "roundtrip retains the original opaque declaration identity and exact Native field width");
  assert.equal(Object.hasOwn(retained, "sourceType"), false);
  assert.equal(Object.hasOwn(retained.members[0], "sourceTypes"), false);
  const rawType = { get poison() { reads += 1; throw new Error("raw compiler objects must not be traversed"); } };
  assert.throws(() => snapshotCsharpTargetTypes([{ ...union, csharpRuntimeUnionObjectShapes:
    [{ ...shape, sourceType: rawType }, undefined] }]), TypeError,
  "a raw checked-Type field is not another accepted opaque identity path");
  const foreign = { ...payload, id: "foreign.EvidencePayload" };
  const foreignUnion = csharpRuntimeUnionTargetType([foreign, csharpStringTargetType()]);
  const poisoned = { get union() { reads += 1; return union; }, index: 0 };
  for (const changed of [
    { ...selected, path: [{ union, index: 1 }] },
    { ...selected, path: [{ union: foreignUnion, index: 0 }] },
    { ...selected, path: [poisoned] },
    { ...selected, path: [{ union, index: 0, extra: true }] },
    { ...selected, path: new Array(1) },
    { ...selected, armType: foreign },
    { ...selected, retainsAbsence: true },
  ]) assert.equal(csharpRuntimeUnionProjectionMatches(policy, union, payload, changed), false,
    "exact arm, path, payload, absence and ordinary metadata validation remain required");
  assert.equal(reads, 0, "compiler handles and untrusted path accessors are not executed");
});
