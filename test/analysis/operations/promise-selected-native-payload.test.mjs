import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsPromiseCallPolicies } from "../../../dist/policy/operations/source-profiles/js/promises.js";
import { csharpSourcePrimitiveTargetType, csharpTaskTargetType, csharpVoidTargetType,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const reject = csharpJsPromiseCallPolicies.find(policy =>
  policy.source.declaringName === "PromiseConstructor" && policy.source.name === "reject");

// nextgen C-2542: the call source is the C# view of the Host selection (CsharpSourceProfileCallSource: authored
// arguments with published descriptors, instantiated parameters, Host argument correspondences, method binders); the
// checker records (sourceResultType, selectedType, sourceArguments, sourceArgumentBindings) are gone. The bindings carry
// F3's requested correspondence fields (R-B-1: argumentIndex, effectiveIndex, form). Each type argument input pairs
// its binder source with its C# carrier (CsharpSourceProfileTypeArgumentInput).
function rejectionContext(resultType, typeArguments) {
  const expression = {};
  const call = {};
  const reason = Object.freeze({ kind: "intrinsic", intrinsic: "unknown" });
  const inputs = typeArguments.map(argument => Object.freeze({
    source: Object.freeze({ binder: argument.node, type: argument.type, explicit: true }),
    carrier: argument.carrier, parameter: undefined,
  }));
  return {
    source: {
      call, selection: Object.freeze({ use: call }),
      arguments: [{ expression, type: reason }],
      parameters: [Object.freeze({ kind: "optional", type: reason })],
      bindings: [Object.freeze({ argument: expression, parameterIndex: 0, mode: "positional",
        argumentIndex: 0, effectiveIndex: 0, form: "value" })],
      typeArguments: inputs.map(input => input.source),
    },
    inputs: {
      results: new Map([[call, resultType]]),
      typeArguments: inputs,
    },
  };
}

for (const [name, payload] of [
  ["int64", csharpSourcePrimitiveTargetType("int64")],
  ["uint64", csharpSourcePrimitiveTargetType("uint64")],
  ["void", csharpVoidTargetType()],
]) {
  test(`JS Promise.reject preserves selected native ${name} instead of its erased checked result`, () => {
    assert.equal(reject !== undefined, true, "the declared JS rejection policy exists");
    const context = rejectionContext(csharpTaskTargetType(csharpSourcePrimitiveTargetType("float64")), [
      { node: {}, type: {}, carrier: payload },
    ]);
    const selected = reject.select(context);
    assert.equal(selected.kind, "resolved", "the selected declaration payload closes the rejection");
    const member = selected.call.targetMember;
    assert.equal(targetTypeRefEquals(member.returnType, csharpTaskTargetType(payload)), true,
      "the exact selected native payload constructs the existing Task");
    assert.equal(member.targetName, "Reject", "the existing runtime rejection operation is retained");
    if (name === "void") {
      assert.equal(member.declaringType?.typeArguments?.length ?? 0, 0,
        "void rejection uses the non-generic runtime owner");
    } else {
      assert.equal(targetTypeRefEquals(member.declaringType?.typeArguments?.[0], payload), true,
        "the runtime owner uses the same exact native payload as its return Task");
    }
    assert.equal(selected.call.arguments.length, 1, "the supplied rejection reason is retained exactly once");
    assert.equal(selected.call.arguments[0].sourceArgumentIndex === 0 &&
      selected.call.arguments[0].targetParameterIndex === 0, true,
    "source and native rejection reason positions are unchanged");
  });
}

test("JS Promise.reject retains the existing inferred Task when no type arguments were selected", () => {
  const result = csharpTaskTargetType(csharpSourcePrimitiveTargetType("int32"));
  const selected = reject.select(rejectionContext(result, []));
  assert.equal(selected.kind, "resolved", "the existing inferred-result owner still closes the call");
  assert.equal(targetTypeRefEquals(selected.call.targetMember.returnType, result), true,
    "inferred native integer width remains unchanged");
});

test("JS Promise.reject does not replace incomplete selected payload evidence with a checked-result fallback", () => {
  const result = csharpTaskTargetType(csharpSourcePrimitiveTargetType("float64"));
  for (const arguments_ of [
    [{ node: {}, type: {} }],
    [{ node: {}, type: {}, carrier: csharpSourcePrimitiveTargetType("int64") },
      { node: {}, type: {}, carrier: csharpSourcePrimitiveTargetType("int64") }],
  ]) {
    const selected = reject.select(rejectionContext(result, arguments_));
    assert.equal(selected.kind, "rejected", "missing or wrong-arity declaration evidence is refused at its owner");
    assert.equal(selected.diagnostic.extensionCode, "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED",
      "the original precise source-profile diagnostic is retained");
  }
});
