import assert from "node:assert/strict";
import test from "node:test";
import { resolveCsharpSourceProfileGenericResult } from "../../../dist/policy/operations/source-profiles/source-profile-result.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTaskTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { csharpNativeSourceProfileCallPolicies } from "../../../dist/policy/operations/source-profiles/native-source-profile.js";

test("generic source-profile results preserve selected native marker width and syntax provenance", () => {
  const explicitTypeNode = {};
  const selectedType = {};
  const sourceFile = {};
  const exact = csharpSourcePrimitiveTargetType("uint64");
  const context = { sourceFile, source: { sourceSelectedMethodTypeArguments: [{ explicitTypeNode, selectedType }] },
    host: { types: { resolveType: () => assert.fail("Selected generic evidence cannot use semantic-only resolution."),
      resolveSelectedType: (node, type, file) => {
        assert.equal(node === explicitTypeNode && type === selectedType && file === sourceFile, true);
        return exact;
      } } } };
  const selected = resolveCsharpSourceProfileGenericResult(context, 1, arguments_ => {
    assert.equal(Object.isFrozen(arguments_), true);
    return csharpTaskTargetType(arguments_[0]);
  });
  assert.equal(targetTypeRefEquals(selected, csharpTaskTargetType(exact)), true);
});

test("generic source-profile result inference uses the existing result owner and rejects incomplete selections", () => {
  const sourceResultType = {};
  const sourceFile = {};
  const inferred = csharpTaskTargetType(csharpSourcePrimitiveTargetType("int32"));
  const context = { sourceFile, source: { sourceResultType }, host: { types: {
    resolveType: (type, file) => {
      assert.equal(type === sourceResultType && file === sourceFile, true);
      return inferred;
    }, resolveSelectedType: () => undefined,
  } } };
  assert.equal(resolveCsharpSourceProfileGenericResult(context, 1, () => assert.fail("Inferred carrier is already constructed.")) === inferred, true);
  for (const selected of [[{ selectedType: {} }], [{ selectedType: {} }, { selectedType: {} }]]) {
    assert.equal(resolveCsharpSourceProfileGenericResult({ ...context, source: { ...context.source, sourceSelectedMethodTypeArguments: selected } },
      1, () => assert.fail("Incomplete or wrong-arity selections cannot construct a carrier.")), undefined);
  }
});

test("native source-profile methods validate the selected signature without consuming outer optional absence", () => {
  const receiverType = {};
  const signatureResultType = {};
  const optionalResultType = {};
  const sourceFile = {};
  const source = {
    sourceReceiver: { expression: {}, type: receiverType }, sourceResultType: optionalResultType,
    sourceSelectedSignatureKind: "resolved", sourceSelectedSignatureParameters: [{}],
    sourceArgumentBindings: [{ sourceArgumentIndex: 0, effectiveArgumentIndex: 0,
      sourceParameterIndex: 0, sourceForm: "value" }],
  };
  const policy = csharpNativeSourceProfileCallPolicies.find(entry => entry.source.name === "EndsWith");
  assert.equal(policy !== undefined, true, "the existing exact native String.EndsWith policy is selected");
  const bool = csharpSourcePrimitiveTargetType("bool");
  const string = csharpStringTargetType();
  const context = { sourceFile, source, host: {
    semantics: file => {
      assert.equal(file === sourceFile, true, "the selected call retains its actual checked source context");
      return { operations: { callResult: actual => {
        assert.equal(actual === source, true, "only the actual selected call supplies its native signature result");
        return { selectedReturnType: signatureResultType };
      } } };
    },
    types: { resolveType: (type, file) => {
      assert.equal(file === sourceFile, true, "native receiver and result resolve in the same checked context");
      assert.equal(type !== optionalResultType, true, "outer optional-chain absence is not a method-signature result");
      return type === receiverType ? string : type === signatureResultType ? bool : undefined;
    } },
  } };
  const selected = policy.select(context);
  assert.equal(selected?.kind === "resolved" && selected.call.receiver.kind === "instance" &&
    targetTypeRefEquals(selected.call.targetMember.returnType, bool), true,
  "the native instance method retains its exact bool result before the outer presence boundary");
  assert.equal(selected.call.arguments.length === 1 && selected.call.arguments[0].sourceArgumentIndex === 0 &&
    selected.call.arguments[0].targetParameterIndex === 0 && source.sourceResultType === optionalResultType, true,
  "the real argument mapping and original optional expression result remain unchanged");
  for (const [label, receiver, result] of [
    ["wrong native receiver", bool, bool], ["wrong native result", string, string],
    ["missing native result", string, undefined],
  ]) {
    const rejected = policy.select({ ...context, host: { ...context.host,
      types: { resolveType: type => type === receiverType ? receiver : result } } });
    assert.equal(rejected?.kind === "rejected" && rejected.diagnostic.message ===
      "The checked source signature for String.EndsWith does not resolve to its declared C# receiver and result carriers.", true,
    `${label}: the original exact native signature refusal is preserved`);
  }
  const missing = policy.select({ ...context, host: { ...context.host,
    semantics: () => ({ operations: { callResult: () => undefined } }) } });
  assert.equal(missing?.kind === "rejected", true, "an absent checked signature cannot be rescued from the optional expression result");
});
