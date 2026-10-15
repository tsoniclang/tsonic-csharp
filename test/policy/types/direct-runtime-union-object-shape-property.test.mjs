import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpRuntimeUnionTargetType,
  csharpStringTargetType,
  resolveCsharpRuntimeUnionObjectShapeProperty,
} from "../../../dist/policy/types/index.js";

const selectedDeclaration = {};
const string = csharpStringTargetType();
const circleType = { kind: "target-named", id: "Shape.Circle" };
const squareType = { kind: "target-named", id: "Shape.Square" };
const circle = {
  targetType: circleType,
  members: [{
    sourceName: "kind",
    sourceSubjects: [selectedDeclaration],
    targetName: "kind",
    memberKind: "property",
    type: string,
  }],
};
const square = {
  targetType: squareType,
  members: [{
    sourceName: "kind",
    sourceSubjects: [selectedDeclaration],
    targetName: "kind",
    memberKind: "property",
    type: string,
  }],
};
const shapes = new Map([
  [circleType.id, circle],
  [squareType.id, square],
]);
const objectShapes = {
  resolveTarget(type) {
    return type?.kind === "target-named" ? shapes.get(type.id) : undefined;
  },
};

test("runtime-union object-shape properties resolve every exact arm member", () => {
  const union = csharpRuntimeUnionTargetType([circleType, squareType]);
  assert.ok(union);
  const resolved = resolveCsharpRuntimeUnionObjectShapeProperty(
    objectShapes,
    union,
    [selectedDeclaration],
  );
  assert.equal(resolved.kind, "resolved");
  assert.equal(resolved.members.length, 2);
  assert.deepEqual(resolved.resultType, string);
});

test("runtime-union object-shape properties fail closed on incomplete arms", () => {
  const union = csharpRuntimeUnionTargetType([
    circleType,
    { kind: "target-named", id: "Shape.Missing" },
  ]);
  assert.ok(union);
  const resolved = resolveCsharpRuntimeUnionObjectShapeProperty(
    objectShapes,
    union,
    [selectedDeclaration],
  );
  assert.equal(resolved.kind, "rejected");
  assert.match(resolved.reason, /arm 2 has no finalized object-shape/u);
});
