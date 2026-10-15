import assert from "node:assert/strict";
import test from "node:test";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

const identity = (site) => targetUseSiteIdentity(site);

test("one native use site is keyed by its consuming construct, slot and contextual target", () => {
  const call = {};
  const other = {};
  const first = csharpNativeUseSite(call, { kind: "argument", sourceIndex: 0, effectiveIndex: 0, parameterIndex: 0 });
  const again = csharpNativeUseSite(call, { kind: "argument", sourceIndex: 0, effectiveIndex: 0, parameterIndex: 0 });
  assert.equal(first.subject === call && identity(first) === identity(again), true, "equal inputs give one identity");
  assert.equal(Object.isFrozen(first), true, "the key is frozen");
  const slots = [
    { kind: "argument", sourceIndex: 0, effectiveIndex: 1, parameterIndex: 0 },
    { kind: "argument", sourceIndex: 0, effectiveIndex: 0, parameterIndex: 1 },
    { kind: "argument", sourceIndex: 0, effectiveIndex: 0 },
    { kind: "receiver" },
    { kind: "callee" },
    { kind: "operand", position: "left" },
    { kind: "operand", position: "right" },
    { kind: "branch", branch: "true" },
    { kind: "element", index: 0 },
    { kind: "member", index: 0 },
    { kind: "intrinsic-operand", operand: "value" },
    { kind: "intrinsic-operand", operand: "argument", index: 0 },
    { kind: "base-argument", sourceIndex: 0 },
  ];
  const identities = new Set([identity(first), ...slots.map(slot => identity(csharpNativeUseSite(call, slot)))]);
  assert.equal(identities.size, slots.length + 1, "every distinct slot of one construct has a distinct identity");
  assert.equal(csharpNativeUseSite(other, { kind: "receiver" }).subject === other, true, "the subject is the consuming construct");
  const stringTarget = csharpNativeUseSite(call, { kind: "return" }, { target: csharpStringTargetType() });
  const valueTarget = csharpNativeUseSite(call, { kind: "return" }, { target: csharpTsValueTargetType() });
  const noTarget = csharpNativeUseSite(call, { kind: "return" });
  assert.equal(new Set([identity(stringTarget), identity(valueTarget), identity(noTarget)]).size, 3,
    "the same slot in different contextual native targets stays distinct");
});
