import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { carrierDeclarationId, deriveCarrierVocabulary, loadCarrierRegistry, validateCarrierRegistry } from "../../../../../tsonic/test/helpers/carrier-registry.mjs";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/factories.js";
import { csharpTaskTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpJsMapTargetType, csharpJsTypedArrayTargetType } from "../../../../dist/target-model/types/carriers/js.js";
import { isCsharpTargetTypeRef, snapshotCsharpTargetTypes } from "../../../../dist/target-model/types/snapshot.js";
import { dotnetConstraintToTargetConstraint } from "../../../../dist/providers/native/projection/constraints.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const current = await loadCarrierRegistry(root);

test("C# carrier registry covers the actual native kind union and every concrete constructor contract", () => {
  assert.equal(current.files.has("src/target-model/types/carriers/registry.ts"), true);
  assert.deepEqual(validateCarrierRegistry(current.rows, current.vocabulary), []);
});

test("every C# structural or concrete carrier omission is rejected independently", () => {
  for (const omitted of current.rows) {
    const failures = validateCarrierRegistry(current.rows.filter(row => row !== omitted), current.vocabulary);
    assert.equal(failures.length > 0, true, omitted.id);
  }
  assert.equal(new Set(current.rows.filter(row => !row.id.startsWith("kind:")).map(row => carrierDeclarationId(row.declaration))).size,
    current.vocabulary.contracts.length);
});

test("C# registry is metadata only and does not widen native Task or imported payloads", () => {
  const value = csharpSourcePrimitiveTargetType("int64");
  const pending = csharpTaskTargetType(value);
  assert.equal(pending.csharpTaskResultType === value, true);
  assert.equal(pending.typeArguments[0] === value, true);
  const imported = csharpTargetNamedType("checked.native.Type`1", [value], undefined, { allowsRefLikeTypeArguments: [false], valueType: true });
  assert.equal(imported.typeArguments[0] === value, true);
  assert.equal(imported.csharpValueType, true);
  assert.equal(csharpJsMapTargetType(imported, value).typeArguments[0] === imported, true);
  assert.equal(csharpJsMapTargetType(imported, value).typeArguments[1] === value, true);
  assert.equal(csharpJsTypedArrayTargetType("Uint32Array").csharpEnumerableElementType.name, "uint32");
});

test("C# registry preserves one native absence state without extra broad-value storage", () => {
  const scalar = csharpSourcePrimitiveTargetType("int32");
  const optional = csharpNullableTargetType(scalar);
  assert.equal(csharpNullableTargetType(optional) === optional, true);
  assert.equal(optional.typeArguments[0] === scalar, true);
  const broad = csharpTsValueTargetType();
  assert.equal(csharpNullableTargetType(broad) === broad, true);
});

test("retained E71 vocabulary is explicitly frozen, without admitting additional callable behavior", () => {
  for (const symbol of ["csharpMethodValueType", "rebindCsharpMethodValueTypeParameters"]) {
    const row = current.rows.find(entry => entry.declaration.symbol === symbol);
    assert.equal(row?.frozen, true, symbol);
  }
});

test("unproduced native type vocabulary is rejected at the owning metadata boundary, including nested carriers", () => {
  const scalar = csharpSourcePrimitiveTargetType("int32");
  for (const ghost of [
    { kind: "source-global", name: "Promise", typeArguments: [scalar] },
    { kind: "lifetime", name: "scope" },
    { kind: "associated-type", owner: scalar, name: "Output" },
    { kind: "target-specific", target: "csharp", name: "unproduced" },
  ]) {
    assert.equal(current.vocabulary.kinds.includes(ghost.kind), false, ghost.kind);
    for (const type of [ghost, { kind: "array", element: ghost },
      { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "checked:Wrapper", typeArguments: [ghost] },
      { kind: "tuple", elements: [ghost] }, { kind: "pointer", pointee: ghost },
      { kind: "function-pointer", args: [ghost], result: scalar },
      { kind: "function-pointer", args: [scalar], result: ghost }]) {
      assert.equal(isCsharpTargetTypeRef(type), false, ghost.kind);
      assert.throws(() => snapshotCsharpTargetTypes([type]), /bounded valid carriers/u, ghost.kind);
    }
  }
  assert.equal(isCsharpTargetTypeRef({ kind: "opaque", id: "checked:opaque" }), true);
});

test("C# constraints retain exactly the native projection producer vocabulary, not unused Rust constraints", () => {
  const source = [
    { kind: "implements", contract: { kind: "named", isByRefLike: false, constraintRequiresReferenceType: false, allowsRefLikeTypeArguments: [], metadataName: "Checked.Contract",
      targetId: "Checked, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null::Checked.Contract" } },
    { kind: "value-type" }, { kind: "reference-type" }, { kind: "constructible" },
    { kind: "unmanaged" }, { kind: "not-null" },
  ];
  const produced = source.map(dotnetConstraintToTargetConstraint);
  assert.deepEqual(deriveCarrierVocabulary(current.files, { module: "src/target-model/types/model.ts", symbol: "TargetConstraint" }).kinds,
    [...new Set(produced.map(constraint => constraint.kind))].sort());
  assert.deepEqual(produced.at(-1), { kind: "target-specific", target: "csharp", name: "notnull" });
  for (const kind of ["copy", "clone", "default", "sized", "lifetime"]) {
    assert.equal(produced.some(constraint => constraint.kind === kind), false, kind);
  }
});
