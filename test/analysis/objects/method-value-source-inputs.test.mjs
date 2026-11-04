import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpObjectMethodValueSource, completeCsharpMethodValueContracts, retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";

function environment() {
  return createCsharpTypeParameterEnvironment(() => assert.fail("these synthetic monomorphic M leaves have no generic constraint child"));
}

function method() {
  const integer = csharpSourcePrimitiveTargetType("int32");
  return Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }),
    sourceName: "read", targetName: "read", memberKind: "method", type: csharpDelegateTargetType("System.Func", [integer], integer) });
}

function fixture() {
  const unit = { declaration: {}, literal: {}, captured: {}, reference: {}, observations: [], remembered: [] };
  unit.member = Object.freeze({ ...method(), sourceDeclarations: Object.freeze([unit.declaration]) });
  unit.base = csharpTargetNamedType("unit.MDeclaredBase", [], { kind: "named", name: "MDeclaredBase" },
    { sourceDeclarationKind: "interface", allowsRefLikeTypeArguments: [] });
  unit.implementation = Object.freeze({ declaration: unit.literal, identity: "synthetic-M-source-implementation",
    methods: Object.freeze([unit.declaration]), captures: Object.freeze([Object.freeze({ declaration: unit.captured,
      reference: unit.reference, fieldName: "capture", type: csharpSourcePrimitiveTargetType("int64"),
      mutable: true, initialization: "initialized" })]) });
  unit.input = { target: Object.freeze({ kind: "structural", contract: false }), members: Object.freeze([unit.member]),
    implements: Object.freeze([unit.base]), methodImplementation: unit.implementation };
  unit.subject = Object.freeze({ node: unit.declaration });
  unit.subjectRow = Object.freeze({ kind: "resolved", subject: unit.subject });
  unit.writes = Object.freeze({ kind: "complete", writes: Object.freeze([]) });
  unit.storage = { memberSubjectFor(node) {
    assert.equal(node === unit.declaration, true);
    unit.observations.push("subject");
    return unit.subjectRow;
  }, memberWritesFor(subject) {
    assert.equal(subject === unit.subject, true);
    unit.observations.push("writes");
    return unit.writes;
  } };
  return unit;
}

function forbidSource(unit) {
  unit.storage.memberSubjectFor = () => assert.fail("formed M cannot re-query the method subject");
  unit.storage.memberWritesFor = () => assert.fail("formed M cannot re-query method writes");
}

test("synthetic M source keeps its actual header, declaration and H0 before Native completion", () => {
  const unit = fixture();
  const source = formCsharpObjectMethodValueSource(unit.input, unit.storage);
  assert.equal(source.kind === "methods" && source.input === unit.input && source.target === unit.input.target && source.selected === undefined, true);
  assert.equal(source.facts.length === 1 && source.facts[0].member === unit.member && source.facts[0].kind === "method", true);
  const facts = source.facts[0];
  assert.equal(facts.declaration === unit.declaration && facts.subject === unit.subjectRow && facts.writes === unit.writes, true);
  assert.equal(facts.signature.type === unit.member.type && facts.signature.sourceDeclarations === unit.member.sourceDeclarations && facts.nativeMethod, true);
  assert.deepEqual(unit.observations, ["subject", "writes"]);
  assert.deepEqual(unit.remembered, []);
  forbidSource(unit);
  const owner = environment();
  const result = completeCsharpMethodValueContracts(source, shape => { unit.remembered.push(shape); return shape; }, owner);
  assert.equal(result.methodImplementation === unit.implementation && result.members[0].sourceDeclarations === unit.member.sourceDeclarations, true);
  assert.equal(result.members[0].methodValueStorage === undefined && result.implements.some(type => type === unit.base), true);
  assert.equal(unit.remembered.length === 1 && targetTypeRefEquals(unit.remembered[0].targetType, result.members[0].methodValueContract), true);
  assert.equal(targetTypeRefEquals(result.targetType,
    createStructuralObjectShapeTarget(result.members, result.implements, owner, false, unit.implementation)), true);
  assert.deepEqual(unit.observations, ["subject", "writes"]);
});

test("synthetic M own protocol and the supported normal entry keep the same single target", () => {
  const member = method();
  const input = { target: Object.freeze({ kind: "structural", contract: true }), members: Object.freeze([member]) };
  const storage = { memberSubjectFor: () => assert.fail("the synthetic abstract method has no authored H0 subject") };
  const owner = environment();
  const remember = () => assert.fail("the same own protocol cannot publish a second self shape");
  const source = formCsharpObjectMethodValueSource(input, storage);
  assert.equal(source.kind === "methods" && source.facts[0].member === member && source.facts[0].declaration === undefined, true);
  const result = completeCsharpMethodValueContracts(source, remember, owner);
  const normal = retainCsharpMethodValueContracts(input, remember, owner, storage);
  assert.equal(targetTypeRefEquals(result.members[0].methodValueContract, result.targetType), true);
  assert.equal(result.implements === undefined && normal.implements === undefined, true);
  assert.equal(targetTypeRefEquals(result.targetType, normal.targetType), true);
  assert.equal(targetTypeRefEquals(result.targetType, createStructuralObjectShapeTarget(result.members, result.implements, owner, true)), true);
});

test("synthetic fixed M source keeps the existing target without H0 or Native protocol children", () => {
  const target = csharpTargetNamedType("unit.MFixed", [], { kind: "named", name: "MFixed" },
    { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [] });
  const input = { target: Object.freeze({ kind: "existing", type: target }), members: Object.freeze([method()]), sourceType: {} };
  const source = formCsharpObjectMethodValueSource(input, {
    memberSubjectFor: () => assert.fail("a fixed existing target cannot query H0"),
  });
  assert.equal(source.kind === "fixed" && source.input === input && source.target === input.target && source.selected === target, true);
  const result = completeCsharpMethodValueContracts(source,
    () => assert.fail("a fixed existing target cannot register a protocol"), environment());
  assert.equal(result.targetType === target && result.members === input.members && result.sourceType === input.sourceType, true);
});

test("synthetic M rejects foreign, sparse or retired inputs before Native owners", () => {
  const unit = fixture();
  const source = formCsharpObjectMethodValueSource(unit.input, unit.storage);
  forbidSource(unit);
  const remember = () => assert.fail("invalid retained M input cannot register a Native child");
  const sparse = new Array(source.facts.length);
  for (const invalid of [undefined, unit.input, { ...source, kind: "retired" },
    { ...source, target: { ...source.target } }, { ...source, selected: {} },
    { ...source, facts: [] }, { ...source, facts: sparse },
    { ...source, facts: [{ ...source.facts[0], member: {} }] },
    { ...source, facts: [{ ...source.facts[0], kind: "retired" }] },
    { ...source, input: { ...unit.input, targetType: {} } },
    { ...source, input: { ...unit.input, members: [{ ...unit.member }] } },
  ]) assert.throws(() => completeCsharpMethodValueContracts(invalid, remember, environment()), /exact retained source selection and member facts/);
  assert.throws(() => formCsharpObjectMethodValueSource({ targetType: {}, members: [unit.member] }, unit.storage),
    /original canonical source selection before physical construction/);
  assert.deepEqual(unit.observations, ["subject", "writes"]);
});
