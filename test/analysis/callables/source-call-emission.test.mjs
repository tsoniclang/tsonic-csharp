import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSourceCallEmission } from "../../../dist/analysis/callables/emission/source-call-emission.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";

test("a refused source callee is not replaced by missing argument or generic emission evidence", () => {
  const call = {};
  const expression = {};
  const reason = "The exact selected source callee is external to the project and has no C# target relation.";
  const source = { sourceCallee: { expression } };
  const classification = { form: { kind: "source" }, target: { kind: "source-owned", source },
    unionCall: { kind: "not-union" }, sourceCall: { kind: "rejected", reason },
    sourceArgumentGrouping: { kind: "unresolved", reason: "No finalized native parameter contracts." } };
  const none = { get: () => undefined };
  const result = analyzeCsharpSourceCallEmission({
    source: { ast: { parent: () => undefined, as: { AsPropertyAccessExpression: () => undefined } } },
    nodes: [call], admitted: () => true,
    operations: { selectedCall: { get: node => node === call ? classification : undefined },
      selectedConstruction: none, nativeHandler: none },
    evidence: { sourceArgument: none, sourceDefaultValue: none }, declarations: {}, conversions: {},
    references: { identifierEmission: none }, captures: { captureClosure: none },
  });
  assert.equal(result.issues.length, 1, "the selected rejection has one publication path");
  assert.equal(result.issues[0].code, "CSHARP_UNSUPPORTED_AST", "the existing source-callee diagnostic code is retained");
  assert.equal(result.issues[0].message, reason, "the exact callee-owner reason survives unavailable later contracts");
  assert.equal(result.issues[0].sourceNode === call, true, "the refusal retains the original call identity");
  assert.equal(result.records.sourceCallEmission.get(call) === undefined, true, "the rejected call is not published");
  assert.equal(result.records.sourceArgumentsEmission.get(call) === undefined, true, "arguments of a rejected callee are not published");
});

test("source calls retain the completed physical capture invocation instead of the logical self delegate", () => {
  const scalar = { kind: "source-primitive", name: "int32" };
  const signature = csharpDelegateTargetType("System.Func", [scalar], scalar);
  const protocol = { kind: "target-named", id: "tsonic.shape:self", csharpRender: { kind: "named", name: "Self" } };
  const physical = csharpMethodValueType(protocol, "__tsonic_invoke_body_read", "original-self", signature, []);
  const declaration = {};
  const classOwner = {};
  const constructor = {};
  const constructorBody = {};
  const expression = {};
  const call = {};
  const source = { selectedSignature: {}, sourceCallee: { expression, selectedDeclaration: declaration } };
  const selected = { kind: "value", expression, type: signature };
  const classification = { form: { kind: "source" }, target: { kind: "source-owned", source }, unionCall: { kind: "not-union" },
    sourceCall: selected, sourceTypeArguments: [], sourceResult: { selectedType: scalar, nativeType: scalar },
    sourceArgumentGrouping: { kind: "grouped", arguments: [], groups: [] } };
  const classify = (reference, closure) => analyzeCsharpSourceCallEmission({
    source: { ast: { parent: node => node === constructorBody ? constructor : node === constructor ? classOwner : undefined,
      as: { AsPropertyAccessExpression: () => undefined } },
      navigation: { isProjectDeclaration: node => node === declaration || node === classOwner } },
    nodes: [call], admitted: () => true,
    operations: { selectedCall: { get: node => node === call ? classification : undefined },
      selectedConstruction: { get: () => undefined }, nativeHandler: { get: () => undefined } },
    evidence: { sourceArgument: { get: () => undefined }, sourceDefaultValue: { get: () => undefined },
      signatureDeclaration: { get: () => declaration } },
    declarations: {}, conversions: {}, references: { identifierEmission: { get: () => reference } },
    captures: { captureClosure: { get: node => node === declaration ? closure : undefined } },
  });
  const frame = { kind: "frame", declaration };
  const nativeClosure = (type, ownership, protocols, scope) => {
    const method = { declaration, scope, methodName: "__tsonic_invoke_body_read", type, captures: [], receivers: [] };
    return { method, frame: { scope, ownership, protocols, methods: [method], bindings: [], parents: [], receivers: [], shape: protocol } };
  };
  const quantified = type => nativeClosure(type, "value", [{ kind: "quantified", declaration }], declaration);
  const actual = classify(frame, quantified(physical));
  assert.equal(actual.issues.length, 0, "the checked logical self and completed native body have distinct representations");
  assert.equal(actual.records.sourceCallEmission.get(call).callee === selected, true, "the exact original selected call is retained");
  assert.equal(actual.records.sourceCallEmission.get(call).methodValue, "__tsonic_invoke_body_read",
    "the native frame invokes its already-selected body rather than invoking this as a delegate");
  for (const [label, closure] of [
    ["missing closure", undefined],
    ["logical delegate is not a native frame protocol", quantified(signature)],
    ["missing quantified protocol", nativeClosure(physical, "value", [], declaration)],
    ["foreign class protocol", nativeClosure(signature, "activation", [{ kind: "class", declaration: {} }], constructorBody)],
  ]) {
    const rejected = classify(frame, closure);
    assert.equal(rejected.issues.length === 1 && rejected.records.sourceCallEmission.get(call) === undefined, true, label);
  }
  const method = classify(frame, nativeClosure(signature, "activation", [{ kind: "class", declaration: classOwner }], constructorBody));
  assert.equal(method.issues.length === 0 && method.records.sourceCallEmission.get(call).methodValue === undefined, true,
    "an actual captured native method group is already directly invocable");
  const ordinary = classify({ kind: "local", declaration, backing: false }, undefined);
  assert.equal(ordinary.issues.length === 0 && ordinary.records.sourceCallEmission.get(call).methodValue === undefined, true,
    "an ordinary delegate never acquires a synthetic frame protocol or body");
});
