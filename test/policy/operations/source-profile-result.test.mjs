import assert from "node:assert/strict";
import test from "node:test";
import { resolveCsharpSourceProfileGenericResult } from "../../../dist/policy/operations/source-profiles/source-profile-result.js";
import { csharpSourcePrimitiveTargetType, csharpTaskTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { csharpSourceProfileInputs } from "../../helpers/planning-records.mjs";

// The policy reads the input facts the analysis resolved for the call: method binders from the Host instantiation
// (facts.instantiations.at) and the call result from the Host call selection, each represented once.
const withInputs = context => ({ ...context, inputs: csharpSourceProfileInputs(context.host, {
  operation: context.source.call, call: context.source }) });
const callSource = (call, typeArguments = [], result = { kind: "intrinsic", intrinsic: "unknown" }) => ({
  call, selection: { use: call, result }, arguments: [], bindings: [], parameters: [], typeArguments });

test("generic source-profile results preserve the Host instantiation's native marker width", () => {
  const binder = {};
  const call = {};
  const exact = csharpSourcePrimitiveTargetType("uint64");
  const context = { source: callSource(call, [{ binder, type: { kind: "primitive", primitive: "uint64" }, explicit: true }]),
    host: { types: { instantiation: use => {
      assert.equal(use, call, "the instantiation is read at the exact call occurrence");
      return { method: [exact], receiver: [], parameters: [], result: exact };
    } } } };
  const selected = resolveCsharpSourceProfileGenericResult(withInputs(context), 1, arguments_ => {
    assert.equal(Object.isFrozen(arguments_), true);
    return csharpTaskTargetType(arguments_[0]);
  });
  assert.equal(targetTypeRefEquals(selected, csharpTaskTargetType(exact)), true);
});

test("generic source-profile result inference uses the published call result and rejects incomplete selections", () => {
  const result = { kind: "declared", declaration: {}, typeArguments: [] };
  const inferred = csharpTaskTargetType(csharpSourcePrimitiveTargetType("int32"));
  const call = {};
  const context = { source: callSource(call, [], result), host: { types: {
    represent: (type, site, position) => {
      assert.equal(type === result && site === call && position === "value", true, "the Host call result is represented as a value");
      return inferred;
    },
  } } };
  assert.equal(resolveCsharpSourceProfileGenericResult(withInputs(context), 1, () => assert.fail("Inferred carrier is already constructed.")) === inferred, true);
  const binder = () => ({ binder: {}, type: { kind: "intrinsic", intrinsic: "unknown" }, explicit: false });
  for (const selected of [[binder()], [binder(), binder()]]) {
    assert.equal(resolveCsharpSourceProfileGenericResult(withInputs({ ...context, source: callSource(call, selected, result) }),
      1, () => assert.fail("Incomplete or wrong-arity selections cannot construct a carrier.")), undefined);
  }
});
