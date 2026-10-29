import assert from "node:assert/strict";
import test from "node:test";
import { collectCsharpReferenceClosure } from "../../../../dist/analysis/objects/native-demand-references.js";
import { targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";
import { inheritedObjectShapeCapabilities } from "../../../../dist/analysis/objects/native-demand-closure.js";
import { maximumArtifactCount } from "../../../../dist/analysis/objects/native-demand-batches.js";

function sourceClass(id, arguments_ = []) {
  return {
    targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: arguments_.map(() => false), id, csharpSourceDeclarationKind: "class", typeArguments: arguments_ },
    members: [],
  };
}

function createScope(entries, options = {}) {
  const known = new Map(entries.map(entry => [targetTypeRefKey(entry.shape.targetType), entry]));
  const declarations = new Map(entries.map(entry => [entry.declaration ?? entry.shape, entry.declaration ?? entry.shape]));
  return {
    host: {
      objectShapes: {
        resolveTarget: selected => options.resolveTarget?.(selected) ?? known.get(targetTypeRefKey(selected))?.shape,
        resolveNode: declaration => options.missingDeclarations ? undefined
          : options.resolveNode?.(declaration) ?? declarations.get(declaration),
      },
      projectTypes: {
        heritageForTarget(selected) {
          const entry = known.get(targetTypeRefKey(selected));
          if (entry === undefined || entry.missingHeritage) return undefined;
          return { definition: {
            id: selected.id, kind: "class", declaration: entry.declaration ?? entry.shape,
            typeParameterBindings: (entry.declaration ?? entry.shape).targetType.typeArguments ?? [],
          }, ...(entry.base === undefined ? {} : { baseType: entry.base }) };
        },
      },
    },
    records: new Map(),
    visibleObjectShapes: () => entries.map(entry => entry.shape),
  };
}

function collect(root, entries, options = {}) {
  return collectCsharpReferenceClosure(createScope(entries, options), root.targetType, root, new Map(),
    options.capability ?? "reference-identity");
}

function assertShapes(result, expected) {
  assert.equal(result.kind, "accepted", result.kind === "rejected" ? result.reason : "closed native storage");
  assert.deepEqual([...result.shapes.values()].map(shape => targetTypeRefKey(shape.targetType)).sort(),
    expected.map(shape => targetTypeRefKey(shape.targetType)).sort());
}

test("native reference identity does not introduce frozen base storage owners", () => {
  const base = sourceClass("Base");
  const middle = sourceClass("Middle");
  const leaf = sourceClass("Leaf");
  const other = sourceClass("Other");
  assertShapes(collect(leaf, [
    { shape: leaf, base: middle.targetType },
    { shape: other },
    { shape: middle, base: base.targetType },
    { shape: base },
  ]), [leaf]);
});

test("structural reference identity follows declared interfaces without frozen base or child payloads", () => {
  const view = { targetType: {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "View", csharpStructuralContract: true,
  }, members: [] };
  const base = sourceClass("Base");
  const child = sourceClass("Child");
  const leaf = sourceClass("Leaf");
  leaf.implements = [view.targetType];
  leaf.members = [{ type: child.targetType }];
  assertShapes(collect(view, [
    { shape: view }, { shape: base }, { shape: child },
    { shape: leaf, base: base.targetType },
  ]), [view, leaf]);
});

test("closed generic reference identity does not require a frozen native declaration owner", () => {
  const parameter = { kind: "type-parameter", identity: "Base:T", name: "T" };
  const integer = { kind: "source-primitive", name: "int32" };
  const text = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "System.String" };
  const template = sourceClass("Base", [parameter]);
  const numeric = sourceClass("Base", [integer]);
  const textual = sourceClass("Base", [text]);
  const leaf = sourceClass("Leaf");
  assertShapes(collect(leaf, [
    { shape: template },
    { shape: numeric, declaration: template },
    { shape: textual, declaration: template },
    { shape: leaf, base: numeric.targetType },
  ]), [leaf]);
});

test("native inheritance does not expand unrelated reference capability contracts", () => {
  const base = sourceClass("Base");
  const leaf = sourceClass("Leaf");
  assertShapes(collect(leaf, [{ shape: base }, { shape: leaf, base: base.targetType }],
    { capability: "reference-identity" }), [leaf]);
});

test("late source class registration does not inherit a native base freeze demand", () => {
  const base = sourceClass("Base");
  const leaf = sourceClass("Leaf");
  const scope = createScope([{ shape: base }, { shape: leaf, base: base.targetType }]);
  scope.records.set("base", { fact: base, capabilities: new Set(["reference-identity"]) });
  assert.deepEqual(inheritedObjectShapeCapabilities(scope, leaf), []);
});

test("late generic inheritance never promotes native declarations into a freeze closure", () => {
  const baseParameter = { kind: "type-parameter", identity: "Base:T", name: "T" };
  const derivedParameter = { kind: "type-parameter", identity: "Derived:T", name: "T" };
  const base = sourceClass("Base", [baseParameter]);
  const selectedBase = sourceClass("Base", [derivedParameter]);
  const leaf = sourceClass("Derived", [derivedParameter]);
  const scope = createScope([
    { shape: base }, { shape: selectedBase, declaration: base }, { shape: leaf, base: selectedBase.targetType },
  ]);
  scope.records.set("base", { fact: base, capabilities: new Set(["reference-identity"]) });
  assert.deepEqual(inheritedObjectShapeCapabilities(scope, leaf), []);
  assertShapes(collect(base, [
    { shape: base }, { shape: selectedBase, declaration: base }, { shape: leaf, base: selectedBase.targetType },
  ]), [base]);
});

test("reference identity is independent of obsolete frozen base storage evidence", () => {
  const leaf = sourceClass("Leaf");
  const base = sourceClass("Base");
  for (const options of [
    { entries: [{ shape: leaf, missingHeritage: true }] },
    { entries: [{ shape: leaf }], missingDeclarations: true },
    { entries: [{ shape: leaf }], resolveNode: () => sourceClass("Leaf", [
      { kind: "type-parameter", identity: "stale:T", name: "T" },
    ]) },
    { entries: [{ shape: leaf, base: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "External" } }] },
    { entries: [{ shape: base }, { shape: leaf, base: base.targetType }],
      resolveTarget: selected => selected.id === "Base" ? sourceClass("Other") : undefined },
    { entries: [{ shape: leaf, base: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "External" } }],
      resolveTarget: selected => selected.id === "External"
        ? { targetType: selected, members: [] } : undefined },
  ]) {
    assertShapes(collect(leaf, options.entries, options), [leaf]);
  }
});

test("reference storage closure retains its finite artifact-count guard", () => {
  const root = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Root" }, members: [] };
  const visible = Array.from({ length: maximumArtifactCount }, (_, index) => ({
    targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: `Child${index}` }, members: [], implements: [root.targetType],
  }));
  const result = collectCsharpReferenceClosure({
    host: { objectShapes: { resolveTarget: () => root } },
    visibleObjectShapes: () => visible,
  }, root.targetType, root, new Map(), "reference-identity");
  assert.equal(result.kind, "rejected", "finite node accounting");
  assert.equal(result.reason.includes(`${maximumArtifactCount}-shape budget`), true, "exact shared budget");
});
