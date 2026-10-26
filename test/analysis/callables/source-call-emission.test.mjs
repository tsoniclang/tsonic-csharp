import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSourceCallEmission } from "../../../dist/analysis/callables/source-call-emission.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";

test("source calls retain the completed physical capture invocation instead of the logical self delegate", () => {
  const scalar = { kind: "source-primitive", name: "int32" };
  const signature = csharpDelegateTargetType("System.Func", [scalar], scalar);
  const protocol = { kind: "target-named", id: "tsonic.shape:self", csharpRender: { kind: "named", name: "Self" } };
  const physical = csharpMethodValueType(protocol, "__tsonic_invoke_body_read", "original-self", signature, []);
  const declaration = {};
  const expression = {};
  const call = {};
  const source = { selectedSignature: {}, sourceCallee: { expression, selectedDeclaration: declaration } };
  const selected = { kind: "value", expression, type: signature };
  const classification = { form: { kind: "source" }, target: { kind: "source-owned", source }, unionCall: { kind: "not-union" },
    sourceCall: selected, sourceTypeArguments: [], sourceResult: { selectedType: scalar, nativeType: scalar },
    sourceArgumentGrouping: { kind: "grouped", arguments: [], groups: [] } };
  const classify = (reference, closure) => analyzeCsharpSourceCallEmission({
    source: { ast: { parent: () => undefined, as: { AsPropertyAccessExpression: () => undefined } },
      navigation: { isProjectDeclaration: node => node === declaration } },
    nodes: [call], admitted: () => true,
    operations: { selectedCall: { get: node => node === call ? classification : undefined },
      selectedConstruction: { get: () => undefined }, nativeHandler: { get: () => undefined } },
    evidence: { sourceArgument: { get: () => undefined }, sourceDefaultValue: { get: () => undefined },
      signatureDeclaration: { get: () => declaration } },
    declarations: {}, conversions: {}, references: { identifierEmission: { get: () => reference } },
    captures: { captureClosure: { get: node => node === declaration ? closure : undefined } },
  });
  const frame = { kind: "frame", declaration };
  const actual = classify(frame, { reference: "frame", method: { type: physical } });
  assert.equal(actual.issues.length, 0, "the checked logical self and completed native body have distinct representations");
  assert.equal(actual.records.sourceCallEmission.get(call).callee === selected, true, "the exact original selected call is retained");
  assert.equal(actual.records.sourceCallEmission.get(call).methodValue, "__tsonic_invoke_body_read",
    "the native frame invokes its already-selected body rather than invoking this as a delegate");
  for (const [label, closure] of [
    ["missing closure", undefined],
    ["logical delegate is not a native frame protocol", { reference: "frame", method: { type: signature } }],
  ]) {
    const rejected = classify(frame, closure);
    assert.equal(rejected.issues.length === 1 && rejected.records.sourceCallEmission.get(call) === undefined, true, label);
  }
  const method = classify(frame, { reference: "method", method: { type: signature } });
  assert.equal(method.issues.length === 0 && method.records.sourceCallEmission.get(call).methodValue === undefined, true,
    "an actual captured native method group is already directly invocable");
  const ordinary = classify({ kind: "local", declaration, backing: false }, undefined);
  assert.equal(ordinary.issues.length === 0 && ordinary.records.sourceCallEmission.get(call).methodValue === undefined, true,
    "an ordinary delegate never acquires a synthetic frame protocol or body");
});
