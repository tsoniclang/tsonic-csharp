import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpAuthoredObjectMethods } from "../../../dist/analysis/objects/authored-methods.js";
import { analyzeCsharpCaptureMethods } from "../../../dist/analysis/objects/capture-methods.js";
import { selectCsharpObjectMemberEmission } from "../../../dist/policy/types/objects/object-members.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpDelegateContractRecord } from "../../helpers/planning-records.mjs";

test("authored copied and captured method owners seal the implemented nullable binder primary", () => {
  const outer = { kind: "type-parameter", identity: "Outer", name: "Outer",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  for (const control of [
    { name: "direct", constraints: [{ kind: "keyword", keyword: "class" }], expected: "class" },
    { name: "dependent", constraints: [{ kind: "type", type: outer }], expected: "default" },
    { name: "unconstrained", constraints: [], expected: "default" },
    { name: "value", constraints: [{ kind: "keyword", keyword: "struct" }], expected: undefined },
  ]) {
    const declaration = {};
    const literal = {};
    const parameter = { kind: "type-parameter", identity: "Destination", name: "Destination",
      csharpNullableReference: true, csharpConstraints: { kind: "resolved", constraints: control.constraints } };
    const signature = csharpDelegateTargetType("System.Func", [parameter], parameter);
    const member = { sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
      memberKind: "method", type: signature, sourceDeclarations: [declaration],
      typeParameters: [{ declaration, identity: parameter.identity, name: parameter.name, constraints: control.constraints }] };
    const protocol = createStructuralObjectShapeTarget([member], undefined,
      () => ({ kind: "resolved", constraints: control.constraints }), true);
    const selectedMember = { ...member, methodValueContract: protocol };
    const shape = { targetType: protocol, members: [selectedMember],
      methodImplementation: { declaration: literal, identity: control.name, methods: [declaration], captures: [] } };
    const authored = selectCsharpObjectMemberEmission({ shape, member: selectedMember, authored: true, receiverBound: false });
    assert.equal(authored.kind, "selected", `${control.name}: exact authored signature is admitted`);
    const authoredRecords = analyzeCsharpAuthoredObjectMethods({
      delegateContract: csharpDelegateContractRecord([]),
      ast: { getSourceFile: () => ({}) }, demand: { artifacts: [],
        get: () => ({ materialization: "synthetic", capabilities: [] }) },
      shapes: { knownShapes: () => [shape] }, captures: {},
      members: { objectMember: { get: () => authored.value } },
    });
    assert.equal(authoredRecords.issues.length, 0, `${control.name}: authored body provenance is retained`);
    const authoredPlan = authoredRecords.records.objectMethods.get(shape)[0].bodyInvocation.explicitConstraints;
    assert.equal(authoredPlan.length, 1, `${control.name}: one authored implemented binder`);
    assert.equal(authoredPlan[0], control.expected, `${control.name}: authored declaration owns its primary`);
    assert.equal(Object.isFrozen(authoredPlan), true, `${control.name}: immutable authored plan`);
    const copiedMember = { ...selectedMember,
      methodValueStorage: { kind: "protocol", type: protocol, invocationName: "__tsonic_invoke_body_read" } };
    const copied = selectCsharpObjectMemberEmission({ shape, member: copiedMember, authored: false, receiverBound: false });
    assert.equal(copied.kind === "selected" && copied.value.declaration.kind === "copied", true,
      `${control.name}: actual stored protocol is selected without an authored body`);
    assert.equal(copied.value.declaration.explicitConstraints.length, 1, `${control.name}: one copied implemented binder`);
    assert.equal(copied.value.declaration.explicitConstraints[0], control.expected,
      `${control.name}: copied invocation uses the destination declaration`);
    const type = csharpMethodValueType(protocol, "__tsonic_invoke_body_read", "capture", signature, [parameter.identity]);
    assert.equal(type !== undefined, true, `${control.name}: real quantified method protocol`);
    const method = { declaration, scope: declaration, methodName: "Renamed", type, captures: [], receivers: [] };
    const frame = { scope: declaration, ownership: "value", methods: [method], bindings: [], parents: [], receivers: [], shape };
    const captured = analyzeCsharpCaptureMethods({
      getSourceFile: () => ({}), is: { IsFunctionDeclaration: () => false, IsArrowFunction: () => true },
    }, { frames: [frame] }, { resolveTarget: () => shape }, { get: () => ({
      kind: "source", sourceDeclaration: declaration, returnType: parameter,
      nativeParameters: [{ sourceParameter: {}, targetParameter: { type: parameter, passingMode: "by-value" } }],
    }) }, csharpDelegateContractRecord([]));
    assert.equal(captured.issues.length, 0, `${control.name}: exact captured native contract is admitted`);
    const capturedPlan = captured.records.captureMethods.get(shape)[0].protocolMethods[0].explicitConstraints;
    assert.equal(capturedPlan.length, 1, `${control.name}: one captured implemented binder`);
    assert.equal(capturedPlan[0], control.expected, `${control.name}: captured invocation uses the destination declaration`);
    assert.equal(Object.isFrozen(capturedPlan), true, `${control.name}: immutable captured plan`);
  }
});
