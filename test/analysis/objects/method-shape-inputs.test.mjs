import assert from "node:assert/strict";
import test from "node:test";
import { retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const signature = csharpDelegateTargetType("System.Func", [integer], integer);
const environment = createCsharpTypeParameterEnvironment(() => assert.fail("these monomorphic metadata controls have no generic binder"));
const method = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }),
  sourceName: "read", targetName: "read", memberKind: "method", type: signature });

test("method completion rejects the removed target-bearing input before any child", () => {
  const targetType = createStructuralObjectShapeTarget([method], undefined, environment, true);
  assert.throws(() => retainCsharpMethodValueContracts({ targetType, members: [method] },
    () => assert.fail("the removed input cannot register a protocol"), environment, {
      memberSubjectFor: () => assert.fail("the removed input cannot query a method slot"),
    }), /original canonical source selection before physical construction/u);
});

test("an own one-member protocol uses the same target without self inheritance or duplicate publication", () => {
  const selected = retainCsharpMethodValueContracts({ target: { kind: "structural", contract: true }, members: [method] },
    () => assert.fail("the exact own protocol cannot register a second self shape"), environment, {
      memberSubjectFor: () => assert.fail("this synthetic abstract signature has no authored method slot"),
    });
  const expected = createStructuralObjectShapeTarget(selected.members, selected.implements, environment, true);
  assert.equal(targetTypeRefEquals(selected.targetType, expected), true, "the final key is the original constructor on the final members");
  assert.equal(targetTypeRefEquals(selected.members[0].methodValueContract, selected.targetType), true, "the actual self protocol is retained");
  assert.equal(selected.implements, undefined, "the own protocol does not manufacture native self inheritance");
});

test("own method construction retains the actual base flag implementation captures and original exposure decisions", () => {
  const declaration = Object.freeze({});
  const literal = Object.freeze({});
  const captured = Object.freeze({});
  const reference = Object.freeze({});
  const member = Object.freeze({ ...method, sourceDeclarations: Object.freeze([declaration]) });
  const base = csharpTargetNamedType("unit.DeclaredBase", [], { kind: "named", name: "DeclaredBase" },
    { sourceDeclarationKind: "interface", allowsRefLikeTypeArguments: [] });
  const implementation = Object.freeze({ declaration: literal, identity: "synthetic-fixed-method-implementation",
    methods: Object.freeze([declaration]), captures: Object.freeze([Object.freeze({ declaration: captured, reference,
      fieldName: "captured", type: csharpSourcePrimitiveTargetType("int64"), mutable: false, initialization: "initialized" })]) });
  const subject = Object.freeze({ node: declaration });
  let subjects = 0;
  let writes = 0;
  const remembered = [];
  const selected = retainCsharpMethodValueContracts({ target: { kind: "structural", contract: false }, members: [member],
    implements: [base], methodImplementation: implementation }, shape => { remembered.push(shape); return shape; }, environment, {
      memberSubjectFor(node) { subjects += 1; assert.equal(node === declaration, true, "the exact authored method is queried");
        return Object.freeze({ kind: "resolved", subject }); },
      memberWritesFor(value) { writes += 1; assert.equal(value === subject, true, "the same physical slot supplies exposure");
        return Object.freeze({ kind: "complete", writes: Object.freeze([]) }); },
    });
  const expected = createStructuralObjectShapeTarget(selected.members, selected.implements, environment, false, implementation);
  assert.equal(subjects === 1 && writes === 1, true, "H0 is consumed once before the single final selection");
  assert.equal(selected.methodImplementation === implementation, true, "the actual implementation and capture vector are retained");
  assert.equal(selected.members[0].sourceDeclarations === member.sourceDeclarations, true, "the exact Source declaration association is retained");
  assert.equal(selected.members[0].methodValueStorage, undefined, "a proven fixed method does not become a mutable delegate slot");
  assert.equal(remembered.length, 1, "the independently required method protocol is published once");
  assert.equal(targetTypeRefEquals(remembered[0].targetType, selected.members[0].methodValueContract), true, "the registered protocol is the exact selected method contract");
  assert.equal(targetTypeRefEquals(selected.targetType, expected), true, "all original constructor arguments determine the final target");
  assert.equal(targetTypeRefEquals(selected.targetType,
    createStructuralObjectShapeTarget(selected.members, selected.implements, environment, true, implementation)), false, "the actual false flag is not replaced by true");
  assert.equal(targetTypeRefEquals(selected.targetType,
    createStructuralObjectShapeTarget(selected.members, selected.implements, environment, false)), false, "implementation and captures are not omitted");
  assert.equal(targetTypeRefEquals(selected.targetType,
    createStructuralObjectShapeTarget(selected.members, undefined, environment, false, implementation)), false, "the actual declared base is not dropped");
});
