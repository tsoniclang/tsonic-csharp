import assert from "node:assert/strict";
import test from "node:test";
import { csharpObjectShapeMethodDeclaration, csharpObjectShapeMethodRequiresProtocol } from "../../../dist/target-model/types/method-values.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";
import { substituteObjectShapeFactTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";

const declaration = Object.freeze({});
const foreign = Object.freeze({});
const member = Object.freeze({ sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
  memberKind: "method", type: { kind: "source-primitive", name: "float64" }, sourceDeclarations: Object.freeze([declaration]) });
const implementation = Object.freeze({ declaration: Object.freeze({}), identity: "body",
  methods: Object.freeze([declaration]), captures: Object.freeze([]) });
const shape = Object.freeze({ targetType: { kind: "target-named", id: "tsonic.shape:owner" },
  members: Object.freeze([member]), methodImplementation: implementation });

test("native method protocol selection does not require its own finalized output", () => {
  assert.equal(csharpObjectShapeMethodRequiresProtocol(member), false);
  assert.equal(csharpObjectShapeMethodRequiresProtocol({ ...member, typeParameters: [{}] }), true);
  assert.equal(csharpObjectShapeMethodRequiresProtocol({ ...member, optional: true }), true);
  assert.equal(csharpObjectShapeMethodRequiresProtocol({ ...member, methodValueContract: shape.targetType }), true);
  assert.equal(csharpObjectShapeMethodRequiresProtocol({ ...member, memberKind: "property", typeParameters: [{}] }), false);
});

test("authored method selection reads only exact finalized declaration identity", () => {
  assert.equal(csharpObjectShapeMethodDeclaration(shape, member), declaration);
  assert.equal(csharpObjectShapeMethodDeclaration(shape, { ...member, sourceDeclarations: [foreign] }), undefined);
  assert.equal(csharpObjectShapeMethodDeclaration(shape, { ...member, sourceDeclarations: undefined }), undefined);
  assert.equal(csharpObjectShapeMethodDeclaration(shape, { ...member, memberKind: "property" }), undefined);
  assert.equal(csharpObjectShapeMethodDeclaration({ ...shape, methodImplementation: undefined }, member), undefined);
  assert.equal(csharpObjectShapeMethodDeclaration({ ...shape, methodImplementation: { ...implementation, methods: undefined } }, member), undefined);
});

test("missing and ambiguous authored method evidence cannot select a body", () => {
  assert.equal(csharpObjectShapeMethodDeclaration({ ...shape,
    methodImplementation: { ...implementation, methods: [] } }, member), undefined);
  assert.equal(csharpObjectShapeMethodDeclaration({ ...shape,
    methodImplementation: { ...implementation, methods: [declaration, declaration] } }, member), undefined);
  const ambiguous = { ...member, sourceDeclarations: [declaration, foreign] };
  assert.equal(csharpObjectShapeMethodDeclaration({ ...shape,
    methodImplementation: { ...implementation, methods: [declaration, foreign] } }, ambiguous), undefined);
});

test("shape equality retains finalized method evidence instead of trusting its identity label", () => {
  assert.equal(csharpObjectShapesEqual(shape, shape), true);
  for (const methods of [[], [foreign], [declaration, foreign]]) {
    assert.equal(csharpObjectShapesEqual(shape, { ...shape,
      methodImplementation: { ...implementation, methods } }), false);
  }
});

test("generic shape substitution preserves immutable authored declaration evidence", () => {
  const result = substituteObjectShapeFactTargetTypeParameters(shape, new Map());
  assert.equal(csharpObjectShapeMethodDeclaration(result, member), declaration);
  assert.equal(result.methodImplementation.methods, implementation.methods);
  assert.equal(Object.isFrozen(result.methodImplementation.methods), true);
});
