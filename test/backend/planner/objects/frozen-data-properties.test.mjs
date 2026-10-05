import assert from "node:assert/strict";
import test from "node:test";
import { guardCsharpFrozenDataProperties } from "../../../../dist/backend/planner/objects/frozen-data-properties.js";

const integer = { kind: "PredefinedType", keyword: "int" };
const input = { program: { storage: { nativeField: () => undefined } } };

function shape(members) {
  return { targetType: { kind: "target-named", id: "Owner" }, members };
}

function data(name, overrides = {}) {
  return { sourceName: name, targetName: name, memberKind: "property", ...overrides };
}

function property(name, modifiers, overrides = {}) {
  return { kind: "PropertyDeclaration", name, modifiers, type: integer,
    autoGetter: true, autoSetter: true, ...overrides };
}

test("freeze guards only concrete native data storage, not abstract contracts or accessors", () => {
  const abstract = property("abstractValue", ["public", "abstract"]);
  const accessor = property("accessorValue", ["public"], { setter: { kind: "Block", statements: [] } });
  const staticValue = property("staticValue", ["public", "static"]);
  const readonly = property("readonlyValue", ["public"], { autoSetter: false });
  const concrete = property("value", ["public", "override"]);
  const diagnostics = [];
  const result = guardCsharpFrozenDataProperties(shape([
    data("abstractValue"), data("accessorValue", { accessor: { getter: true, setter: true } }),
    data("staticValue"), data("readonlyValue", { readonly: true }), data("value"),
  ]), [abstract, accessor, staticValue, readonly, concrete], input, diagnostics);
  assert.equal(diagnostics.length, 0, "closed concrete storage");
  for (const member of [abstract, accessor, staticValue, readonly]) {
    assert.equal(result.includes(member), true, "contract or nondata member unchanged");
  }
  const guarded = result.find(member => member.kind === "PropertyDeclaration" && member.name === "value");
  assert.equal(guarded === undefined, false, "concrete override");
  assert.equal(guarded.modifiers.includes("override"), true, "native dispatch preserved");
  assert.equal(guarded.setter.statements[0].expression.callee.name, "CheckWrite");
  assert.equal(guarded.setter.statements[0].expression.arguments[0].expression.name, "this");
});

test("freeze guards preserve the independent native-addressed and attributed field rejection", () => {
  const field = { kind: "FieldDeclaration", name: "value", modifiers: ["public"], type: integer };
  for (const [member, context] of [
    [field, { program: { storage: { nativeField: () => ({}) } } }],
    [{ ...field, attributes: [{}] }, input],
  ]) {
    const diagnostics = [];
    const result = guardCsharpFrozenDataProperties(shape([data("value")]), [member], context, diagnostics);
    assert.equal(result.length, 0, "unsafe replacement rejected");
    assert.deepEqual(diagnostics.map(diagnostic => diagnostic.code), ["CSHARP_FREEZE_STORAGE_NOT_CLOSED"]);
  }
});
