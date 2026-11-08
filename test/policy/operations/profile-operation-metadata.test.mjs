import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsDateCallPolicies } from "../../../dist/policy/operations/source-profiles/js/date.js";
import { csharpJsNumberCallPolicies } from "../../../dist/policy/operations/source-profiles/js/numbers.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const expression = Object.freeze({});

function context(receiver, arguments_ = []) {
  return { source: { sourceSelectedSignatureKind: "resolved", sourceSelectedSignatureParameters: arguments_.map(() => ({})),
    sourceArguments: arguments_, sourceArgumentBindings: arguments_.map((_argument, index) => ({
      sourceArgumentIndex: index, effectiveArgumentIndex: index, sourceParameterIndex: index, sourceForm: "value",
    })), sourceReceiver: { expression } }, inputs: { values: { get: node => node === expression ? receiver : undefined } } };
}

test("each declared native Date component row preserves its exact int32 ABI", () => {
  for (const name of ["getFullYear", "getMonth", "getDate", "getDay", "getHours", "getMinutes", "getSeconds",
    "getMilliseconds", "getTimezoneOffset"]) {
    const policies = csharpJsDateCallPolicies.filter(policy => policy.source.declaringName === "Date" && policy.source.name === name);
    assert.equal(policies.length === 1, true, name);
    const selected = policies[0].select(context({ kind: "target-named", id: "fixture.Date" }));
    assert.equal(selected.kind === "resolved" && selected.call.targetMember.targetName === name &&
      selected.call.targetMember.returnType.kind === "source-primitive" && selected.call.targetMember.returnType.name === "int32", true, name);
    assert.equal(selected.call.targetMember.parameters.length === 0 && selected.call.receiver.kind === "instance", true, name);
  }
});

test("numeric radix admission follows the declared operation requirement and retains exact native widths", () => {
  const policy = csharpJsNumberCallPolicies.find(policy => policy.source.declaringName === "Number" && policy.source.name === "toString");
  assert.equal(policy !== undefined, true, "the exact Number member has one declarative operation policy");
  const argument = Object.freeze({ expression: {}, type: {} });
  const selected = policy.select(context(integer, [argument]));
  assert.equal(selected.kind === "resolved" && selected.call.targetMember.parameters[0].type === integer &&
    selected.call.targetMember.parameters[1].type.kind === "source-primitive" &&
    selected.call.targetMember.parameters[1].type.name === "int32", true,
  "the int64 receiver never takes a floating route and radix retains its native int32 domain");
  const rejected = policy.select(context(floating, [argument]));
  assert.equal(rejected.kind === "rejected" && rejected.diagnostic.message ===
    "Number.toString(radix) requires an exact native integer receiver.", true);
  const ordinary = policy.select(context(floating));
  assert.equal(ordinary.kind === "resolved" && ordinary.call.targetMember.parameters[0].type === floating, true,
    "no-radix floating formatting remains its independent supported operation");
});
