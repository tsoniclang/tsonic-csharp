import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

const integer = { kind: "source-primitive", name: "int64" };
const floating = { kind: "source-primitive", name: "float64" };
const symbol = {};
// Published descriptor of the selected source value (nextgen C-2542).
const sourceType = { kind: "declared", declaration: {}, typeArguments: [] };
const valueKey = { kind: "string", value: "value" };
const objectMember = declaration => ({ key: valueKey, name: "value", kind: "property", declarations: [declaration],
  type: { kind: "primitive", primitive: "int64" }, optional: false, readonly: false, static: false, owner: {}, inherited: false });
const expression = {};
const carrier = (id, argument = integer) => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id, typeArguments: [argument],
  csharpStructuralContract: true });
const shape = targetType => ({ targetType, sourceType, members: [{ sourceName: "value", targetName: "value",
  sourceKey: { kind: "property", name: "value" }, sourceSubjects: [symbol], memberKind: "property", type: integer }] });

function classifications(source, destination) {
  const shapes = new Map([source, destination].map(value => [targetTypeRefKey(value.targetType), value]));
  const policy = {
    sourceFiles: [], objectShapes: { resolveTarget: type => shapes.get(targetTypeRefKey(type)) },
    projectTypes: { directSupertypes: () => [] },
    // Member correspondence from Host object facts (nextgen C-2542). The old `purpose === "read"` assertion checked a
    // checker structuralMembers argument; facts.objects has no purpose parameter, so it is removed.
    facts: { objects: {
      indexes: () => [],
      members: () => [objectMember(symbol)],
      member(type, key) { assert.equal(type, sourceType); assert.deepEqual(key, valueKey); return objectMember(symbol); },
    } },
  };
  return analyzeCsharpObjectShapes(policy, { targetTypes: [] }, {  });
}

test("C# structural identity is accepted without manufacturing a self-inheritance edge", () => {
  const source = shape(carrier("tsonic.shape:identity"));
  const destination = { ...source, targetType: { ...source.targetType } };
  const selected = classifications(source, destination);
  assert.equal(selected.registerStructuralInterface(expression, source.targetType, destination.targetType, sourceType), true);
  assert.equal(selected.structuralImplementations(source.targetType).length, 0, "identity requires no implementation");
  assert.equal(selected.resolveTarget(source.targetType)?.implements === undefined, true, "identity is not native heritage");
});

test("C# structural identity does not permit incompatible generic self-inheritance", () => {
  const source = shape(carrier("tsonic.shape:identity"));
  const destination = shape(carrier("tsonic.shape:identity", floating));
  const selected = classifications(source, destination);
  assert.equal(selected.registerStructuralInterface(expression, source.targetType, destination.targetType, sourceType), false);
  assert.equal(selected.structuralImplementations(source.targetType).length, 0);
  assert.equal(selected.resolveTarget(source.targetType)?.implements === undefined, true);
});

test("C# structural identity normalization retains independently proven interface implementations", () => {
  const source = shape(carrier("tsonic.shape:source"));
  const destination = shape(carrier("tsonic.shape:destination"));
  const selected = classifications(source, destination);
  assert.equal(selected.registerStructuralInterface(expression, source.targetType, destination.targetType, sourceType), true);
  assert.equal(selected.structuralImplementations(source.targetType).length, 1);
  const [implementation] = selected.structuralImplementations(source.targetType);
  const [property] = implementation.properties;
  assert.equal([implementation, implementation.properties, property, property.member, implementation.methods]
    .every(value => Object.isFrozen(value)), true, "the mapped implementation owns frozen containers and entries");
  let refused = false;
  try { property.member.type = carrier("tsonic.shape:other"); } catch (error) { refused = error instanceof TypeError; }
  assert.equal(refused, true, "a mapped member refuses mutation");
  assert.equal(selected.resolveTarget(source.targetType)?.implements.length, 1);
  assert.equal(selected.resolveTarget(source.targetType)?.implements[0].id, destination.targetType.id);
});

test("structural registration preserves absence as an independent native qualifier", () => {
  const source = shape(carrier("tsonic.shape:present"));
  const destination = shape(carrier("tsonic.shape:optional-view"));
  const selected = classifications(source, destination);
  assert.equal(selected.registerStructuralInterface(expression, csharpNullableTargetType(source.targetType), destination.targetType, sourceType), false);
  assert.equal(selected.structuralImplementations(source.targetType).length, 0);
  assert.equal(selected.registerStructuralInterface(expression, source.targetType, csharpNullableTargetType(destination.targetType), sourceType), true);
  assert.equal(selected.registerStructuralInterface(expression, csharpNullableTargetType(source.targetType), csharpNullableTargetType(destination.targetType), sourceType), true);
  assert.equal(selected.structuralImplementations(source.targetType).length, 1);
});
