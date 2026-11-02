import assert from "node:assert/strict";
import test from "node:test";
import { csharpRuntimeUnionTargetType, combineCsharpTargetUnionMembers, getCsharpRuntimeUnionArms,
  isCsharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { snapshotCsharpTargetTypes, isCsharpTargetTypeRef } from "../../../dist/target-model/types/snapshot.js";

const integer = csharpSourcePrimitiveTargetType("int64");
const text = csharpStringTargetType();
const parameter = Object.freeze({ kind: "type-parameter", identity: "union-semantics:Value", name: "Value" });

test("the existing union formations publish required source-sum versus ordered-native semantics", () => {
  const ordered = csharpRuntimeUnionTargetType([text, integer]);
  const sum = combineCsharpTargetUnionMembers([text, integer]);
  assert.equal(ordered.csharpRuntimeUnionSemantics, "native-ordered");
  assert.equal(sum.csharpRuntimeUnionSemantics, "source-sum");
  assert.equal(isCsharpRuntimeUnionTargetType(ordered) && isCsharpRuntimeUnionTargetType(sum), true);
  assert.equal(targetTypeRefEquals(ordered.typeArguments[0], text), true, "the native declaration keeps its first slot");
  assert.equal(targetTypeRefEquals(sum.typeArguments[0], integer), true, "the source sum is canonical by exact carrier identity");
});

test("only authored source sums flatten and deduplicate; an explicit native union stays an atomic arm", () => {
  const ordered = csharpRuntimeUnionTargetType([integer, integer]);
  const inner = combineCsharpTargetUnionMembers([integer, text]);
  const flattened = combineCsharpTargetUnionMembers([inner, integer, text]);
  assert.equal(targetTypeRefEquals(flattened, inner), true, "nested source sums share one canonical identity");
  const mixed = combineCsharpTargetUnionMembers([ordered, text]);
  const arms = getCsharpRuntimeUnionArms(mixed);
  assert.equal(arms.length, 2);
  assert.equal(arms.some(arm => arm === ordered), true, "no flattening or copy of the native generic struct");
  assert.equal(ordered.typeArguments.length === 2 && ordered.typeArguments.every(arm => arm === integer), true,
    "native repeated slots are not a one-arm source sum");
  assert.equal(combineCsharpTargetUnionMembers([integer, integer]) === integer, true,
    "a source sum of one exact identity needs no union");
});

test("semantic equality and keys retain the sum fact without changing native argument order", () => {
  const sum = combineCsharpTargetUnionMembers([text, parameter]);
  const reordered = combineCsharpTargetUnionMembers([parameter, text]);
  const ordered = csharpRuntimeUnionTargetType(getCsharpRuntimeUnionArms(sum));
  assert.equal(targetTypeRefEquals(sum, reordered), true);
  assert.equal(targetTypeRefKey(sum), targetTypeRefKey(reordered));
  assert.equal(targetTypeRefEquals(sum, ordered), false, "equal physical slots cannot erase the source template's semantics");
  assert.notEqual(targetTypeRefKey(sum), targetTypeRefKey(ordered));
  assert.equal(targetTypeRefEquals(csharpRuntimeUnionTargetType([text, parameter]),
    csharpRuntimeUnionTargetType([parameter, text])), false, "native generic parameters remain positional");
});

test("snapshots preserve the required fact and every ordered native duplicate payload", () => {
  const native = csharpRuntimeUnionTargetType([parameter, parameter]);
  const sum = combineCsharpTargetUnionMembers([native, text]);
  const [snapshot] = snapshotCsharpTargetTypes([sum]);
  assert.equal(snapshot.csharpRuntimeUnionSemantics, "source-sum");
  assert.equal(targetTypeRefEquals(snapshot, sum), true);
  const nested = getCsharpRuntimeUnionArms(snapshot).find(arm => isCsharpRuntimeUnionTargetType(arm));
  assert.equal(nested.csharpRuntimeUnionSemantics, "native-ordered");
  assert.equal(nested.typeArguments.length === 2 && targetTypeRefEquals(nested.typeArguments[0], parameter) &&
    targetTypeRefEquals(nested.typeArguments[1], parameter), true);
  assert.equal(Object.isFrozen(snapshot) && Object.isFrozen(nested) && Object.isFrozen(nested.typeArguments), true);
});

test("a union snapshot rejects missing, invented or contradictory semantics instead of an old-schema fallback", () => {
  const native = csharpRuntimeUnionTargetType([integer, text]);
  const { csharpRuntimeUnionSemantics, ...missing } = native;
  const { csharpRuntimeUnionArms, ...withoutArms } = native;
  for (const invalid of [missing, { ...native, csharpRuntimeUnionSemantics: "erased" }, withoutArms,
    { ...native, csharpRuntimeUnionArms: [text, integer] }]) {
    assert.equal(isCsharpTargetTypeRef(invalid), false, "one exact current source record is required");
    assert.throws(() => snapshotCsharpTargetTypes([invalid]), TypeError);
  }
  assert.equal(isCsharpRuntimeUnionTargetType(missing), false, "the old record does not acquire a guessed native role");
  assert.equal(csharpRuntimeUnionSemantics === "native-ordered" && csharpRuntimeUnionArms.length === 2, true);
});

test("absence stays outside the canonical source sum without changing its native payload slots", () => {
  const sum = combineCsharpTargetUnionMembers([integer, text]);
  const optional = combineCsharpTargetUnionMembers([csharpNullableTargetType(integer), text]);
  const present = getCsharpNullableElementTargetType(optional);
  assert.equal(present.csharpRuntimeUnionSemantics, "source-sum");
  assert.equal(targetTypeRefEquals(present, sum), true);
  assert.equal(getCsharpRuntimeUnionArms(present).length, 2);
  assert.equal(isCsharpTargetTypeRef(optional), true);
});
