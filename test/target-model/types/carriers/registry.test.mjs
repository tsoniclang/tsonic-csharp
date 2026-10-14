import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { carrierDeclarationId, loadCarrierRegistry, validateCarrierRegistry } from "../../../../../tsonic/test/helpers/carrier-registry.mjs";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/factories.js";
import { csharpTaskTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpJsMapTargetType, csharpJsTypedArrayTargetType } from "../../../../dist/target-model/types/carriers/js.js";

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
  const imported = csharpTargetNamedType("checked.native.Type`1", [value], undefined, { valueType: true });
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
