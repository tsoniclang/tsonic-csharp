import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpObjectMethodValueSource, completeCsharpMethodValueContractsSource, completeCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";

function environment() {
  return createCsharpTypeParameterEnvironment(() => assert.fail("synthetic monomorphic protocol inputs have no generic child"));
}

function method(name, declaration) {
  const integer = csharpSourcePrimitiveTargetType("int32");
  return Object.freeze({ sourceKey: Object.freeze({ kind: "property", name }), sourceName: name, targetName: name,
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [integer], integer),
    ...(declaration === undefined ? {} : { sourceDeclarations: Object.freeze([declaration]) }) });
}

function fixture(names) {
  const declarations = names.map(() => ({}));
  const input = { target: Object.freeze({ kind: "structural", contract: false }),
    members: Object.freeze(names.map((name, index) => method(name, declarations[index]))),
    methodImplementation: Object.freeze({ declaration: {}, identity: "synthetic-M-protocol-owner",
      methods: Object.freeze(declarations), captures: Object.freeze([]) }) };
  const observations = [];
  const source = formCsharpObjectMethodValueSource(input, {
    memberSubjectFor(declaration) {
      observations.push(declaration);
      return { kind: "resolved", subject: { node: declaration } };
    },
    memberWritesFor: () => ({ kind: "complete", writes: [] }),
  });
  return { input, declarations, observations, source };
}

test("synthetic M exposes the exact protocol association before its publication child", () => {
  const unit = fixture(["read"]);
  const completion = completeCsharpMethodValueContractsSource(unit.source, environment());
  const first = completion.next();
  assert.equal(first.done, false);
  const request = first.value;
  assert.equal(request.kind === "protocol" && request.source === unit.source && request.memberIndex === 0, true);
  assert.equal(request.method === unit.source.facts[0] && request.method.member === unit.input.members[0], true);
  assert.equal(request.method.declaration === unit.declarations[0] && request.method.subject.subject.node === unit.declarations[0], true);
  assert.equal(request.shape.targetType === request.contract && request.shape.members.length === 1, true);
  assert.equal(request.shape.members[0].methodValueContract === request.contract &&
    request.shape.members[0].sourceDeclarations === unit.input.members[0].sourceDeclarations, true);
  assert.equal(unit.observations.length, 1);
  const last = completion.next({ kind: "protocol", request });
  assert.equal(last.done, true);
  assert.equal(last.value.methodImplementation === unit.input.methodImplementation && last.value.implements.length === 1, true);
  assert.equal(last.value.implements[0] === request.contract && last.value.members[0].methodValueContract === request.contract, true);
  assert.equal(unit.observations.length, 1);
});

test("synthetic M keeps ordered protocol dependencies and rejects a foreign receipt before the next child", () => {
  const unit = fixture(["read", "write"]);
  const completion = completeCsharpMethodValueContractsSource(unit.source, environment());
  const first = completion.next().value;
  const secondStep = completion.next({ kind: "protocol", request: first });
  assert.equal(first.memberIndex === 0 && secondStep.done === false && secondStep.value.memberIndex === 1, true);
  const second = secondStep.value;
  assert.equal(second.source === unit.source && second.method === unit.source.facts[1] &&
    second.method.declaration === unit.declarations[1], true);
  const last = completion.next({ kind: "protocol", request: second });
  assert.equal(last.done, true);
  assert.equal(last.value.implements.length === 2 && last.value.implements[0] === first.contract &&
    last.value.implements[1] === second.contract, true);
  for (const corrupt of [request => ({ kind: "protocol", request: { ...request } }),
    request => ({ kind: "retired", request }), () => undefined]) {
    const invalid = completeCsharpMethodValueContractsSource(unit.source, environment());
    const request = invalid.next().value;
    assert.throws(() => invalid.next(corrupt(request)), /exact chosen protocol publication dependency/);
  }
  assert.equal(unit.observations.length, 2);
});

test("synthetic M own and fixed targets have no protocol publication dependency", () => {
  const member = method("read");
  const own = formCsharpObjectMethodValueSource({ target: { kind: "structural", contract: true }, members: [member] }, {
    memberSubjectFor: () => assert.fail("the abstract own protocol has no H0 declaration"),
  });
  const selected = completeCsharpMethodValueContractsSource(own, environment()).next();
  assert.equal(selected.done, true);
  assert.equal(targetTypeRefEquals(selected.value.targetType, selected.value.members[0].methodValueContract), true);
  assert.equal(selected.value.implements === undefined, true);
  const type = csharpTargetNamedType("unit.ProtocolFixed", [], { kind: "named", name: "ProtocolFixed" },
    { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [] });
  const fixed = formCsharpObjectMethodValueSource({ target: { kind: "existing", type }, members: [member] }, {
    memberSubjectFor: () => assert.fail("the fixed target cannot read H0"),
  });
  const completed = completeCsharpMethodValueContractsSource(fixed, environment()).next();
  assert.equal(completed.done, true);
  assert.equal(completed.value.targetType === type && completed.value.members === fixed.input.members, true);
});

test("synthetic Native M adapter completes each chosen protocol once in the same order", () => {
  const unit = fixture(["read", "write"]);
  const remembered = [];
  const native = completeCsharpMethodValueContracts(unit.source, shape => {
    remembered.push(shape);
    return shape;
  }, environment());
  assert.deepEqual(remembered.map(shape => shape.members[0].sourceName), ["read", "write"]);
  assert.equal(native.members.length === 2 && native.implements.length === 2, true);
  assert.equal(native.members.every((member, index) => targetTypeRefEquals(member.methodValueContract, remembered[index].targetType)), true);
  assert.equal(native.implements.every((type, index) => targetTypeRefEquals(type, remembered[index].targetType)), true);
  assert.equal(unit.observations.length, 2);
});
