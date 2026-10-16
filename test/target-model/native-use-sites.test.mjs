import assert from "node:assert/strict";
import test from "node:test";
import { targetUseSiteIdentity, createTargetClassificationKey, createTargetUseClassificationBuilder } from "@tsonic/target-api/analysis";
import { csharpNativeUseSite } from "../../dist/target-model/records/native-demand.js";
import { csharpSourcePrimitiveTargetType } from "../../dist/target-model/types/carriers/scalar-types.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const floating = csharpSourcePrimitiveTargetType("float64");
const identity = targetUseSiteIdentity;
const argument = Object.freeze({ kind: "argument", sourceIndex: 0, effectiveIndex: 0, parameterIndex: 0 });

test("native use identity preserves actual owner, role, exact argument keys and constructed-result stage", () => {
  const owner = {};
  const same = csharpNativeUseSite(owner, argument);
  assert.equal(identity(same), identity(csharpNativeUseSite(owner, { ...argument })));
  assert.equal(Object.isFrozen(same) && same.subject === owner, true);
  const slots = [argument, { ...argument, sourceIndex: 1 }, { ...argument, effectiveIndex: 1 }, { ...argument, parameterIndex: 1 },
    { kind: "argument", sourceIndex: 0, effectiveIndex: 0 },
    { ...argument, sourceParameterIndex: 0 }, { ...argument, sourceParameterIndex: 1 },
    { kind: "receiver" }, { kind: "callee" }, { kind: "return" }, { kind: "constructed-result" },
    { kind: "operand", position: "left" }, { kind: "operand", position: "right" },
    { kind: "branch", branch: "true" }, { kind: "branch", branch: "false" },
    { kind: "element", index: 0 }, { kind: "member", index: 0 },
    { kind: "intrinsic-operand", operand: "argument", index: 0 }, { kind: "base-argument", sourceIndex: 0 }];
  assert.equal(new Set(slots.map(slot => identity(csharpNativeUseSite(owner, slot)))).size, slots.length);
  const key = createTargetClassificationKey("native-use-owner-control");
  const records = createTargetUseClassificationBuilder();
  const value = Object.freeze({ selected: true });
  records.set(same, key, value);
  const sealed = records.seal();
  assert.equal(sealed.get(csharpNativeUseSite(owner, argument), key) === value, true);
  assert.equal(sealed.get(csharpNativeUseSite({}, argument), key) === undefined, true, "different owner, same textual identity is not the same use");
});

test("requested native target and conversion mode remain independent context keys", () => {
  const owner = {};
  const contexts = [{}, { target: integer }, { target: floating }, { mode: "explicit" },
    { target: integer, mode: "explicit" }, { target: floating, mode: "explicit" }];
  assert.equal(new Set(contexts.map(context => identity(csharpNativeUseSite(owner, { kind: "constructed-result" }, context)))).size,
    contexts.length);
  assert.equal(identity(csharpNativeUseSite(owner, argument, { target: integer })),
    identity(csharpNativeUseSite(owner, argument, { target: csharpSourcePrimitiveTargetType("int32"), mode: "implicit" })),
    "equivalent explicit/default implicit requests have one identity");
  assert.equal(identity(csharpNativeUseSite(owner, argument)), identity(csharpNativeUseSite(owner, argument, { mode: "implicit" })),
    "an explicit default mode does not invent another un-specialized site");
});
