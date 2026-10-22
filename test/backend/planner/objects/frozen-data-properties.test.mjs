import assert from "node:assert/strict";
import test from "node:test";
import { guardCsharpFrozenDataProperties } from "../../../../dist/backend/planner/objects/frozen-data-properties.js";
import { analyzeCsharpFrozenDataProperties } from "../../../../dist/analysis/objects/frozen-data-properties.js";
import { objectShapeArtifactKey } from "../../../../dist/analysis/program/records/object-shape-keys.js";

const integer = { kind: "PredefinedType", keyword: "int" };

function shape(members) {
  return { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Owner" }, members };
}

// A source-declared member: its declaration node carries the authored modifiers and the selected class storage.
function data(name, { modifiers = [], storage = { kind: "property", readonly: false }, ...overrides } = {}) {
  const declaration = { name, modifiers, storage };
  return { sourceName: name, targetName: name, memberKind: "property", sourceDeclarations: [declaration], ...overrides };
}

function property(name, modifiers, overrides = {}) {
  return { kind: "PropertyDeclaration", name, modifiers, type: integer,
    autoGetter: true, autoSetter: true, ...overrides };
}

// The freeze decisions the analysis seals for one js-freeze source artifact.
function sealed(selected, { nativeField = () => undefined, attributed = false } = {}) {
  return analyzeCsharpFrozenDataProperties({
    ast: { hasModifierKind: (declaration, kind) => declaration.modifiers.includes(kind), is: { IsMethodDeclaration: () => false } },
    demand: { artifacts: [{ capabilities: ["js-freeze"], fact: selected, materialization: "source" }] },
    members: { objectMember: { get: () => assert.fail("source artifacts use their class storage") } },
    storage: { nativeField: { get: nativeField } },
    operations: { classPropertyStorage: { get: declaration => declaration.storage } },
    attributes: { attributeApplication: { get: () => attributed ? [{}] : [] } },
  });
}

test("freeze guards only concrete native data storage, not abstract contracts or accessors", () => {
  const abstract = property("abstractValue", ["public", "abstract"]);
  const accessor = property("accessorValue", ["public"], { setter: { kind: "Block", statements: [] } });
  const staticValue = property("staticValue", ["public", "static"]);
  const readonly = property("readonlyValue", ["public"], { autoSetter: false });
  const concrete = property("value", ["public", "override"]);
  const diagnostics = [];
  const selected = shape([
    data("abstractValue", { modifiers: ["abstract"] }), data("accessorValue", { accessor: { getter: true, setter: true } }),
    data("staticValue", { modifiers: ["static"] }), data("readonlyValue", { readonly: true, storage: { kind: "property", readonly: true } }),
    data("value"),
  ]);
  const analysis = sealed(selected);
  assert.deepEqual(analysis.issues, [], "closed concrete storage");
  const context = { program: { records: { frozenDataProperties: analysis.records.frozenDataProperties, nativeMemberHiding: { get(subject) {
    assert.equal(subject.kind, "artifact", "the concrete freeze slot has an admitted artifact identity");
    assert.equal(subject.container, objectShapeArtifactKey(selected), "the freeze slot retains its exact container");
    assert.equal(subject.role, "member", "the freeze slot reads its final member decision");
    assert.equal(subject.member, "__tsonic_frozen_value", "only concrete value storage is rewritten");
    return false;
  } } } } };
  const result = guardCsharpFrozenDataProperties(selected, [abstract, accessor, staticValue, readonly, concrete], context, diagnostics);
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
  for (const options of [{ nativeField: () => ({}) }, { attributed: true }]) {
    const analysis = sealed(shape([data("value", { storage: { kind: "field" } })]), options);
    assert.deepEqual(analysis.issues.map(diagnostic => diagnostic.code), ["CSHARP_FREEZE_STORAGE_NOT_CLOSED"],
      "unsafe replacement rejected before planning");
  }
});
