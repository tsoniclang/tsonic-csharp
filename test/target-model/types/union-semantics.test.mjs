import assert from "node:assert/strict";
import test from "node:test";
import { csharpRuntimeUnionTargetType, combineCsharpTargetUnionMembers, getCsharpRuntimeUnionArms,
  isCsharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { snapshotCsharpTargetTypes, isCsharpTargetTypeRef } from "../../../dist/target-model/types/snapshot.js";
import { createPublishedSourceUnionFixture } from "../../helpers/published-source-unions.mjs";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { getCsharpGenericSourceUnionParts } from "../../../dist/target-model/types/projections.js";

const integer = csharpSourcePrimitiveTargetType("int64");
const text = csharpStringTargetType();
const repeatedInteger = csharpRuntimeUnionTargetType([integer, integer]);
const fixture = createPublishedSourceUnionFixture(`
  import type { int64 } from "@tsonic/core/types.js";
  declare class Native<Value> { readonly value: Value; }
  declare class FixedNative { readonly value: int64; }
  declare function formations(value: string | int64): void;
  declare function flattened(value: (int64 | string) | int64 | string, duplicate: int64 | int64): void;
  declare function mixed(value: FixedNative | string): void;
  declare function generic<Value>(value: string | Value, reversed: Value | string, native: Native<Value> | string): void;
  declare function absent(value: int64 | string | undefined): void;
`, { Native: arguments_ => csharpRuntimeUnionTargetType([arguments_[0], arguments_[0]]), FixedNative: () => repeatedInteger });
const parameter = csharpSourceTypeParameter(fixture.ast.typeParameters(fixture.declaration("generic"))[0], fixture.ast);

test("the existing union formations publish required source-sum versus ordered-native semantics", () => {
  const ordered = csharpRuntimeUnionTargetType([text, integer]);
  const sum = fixture.carrier("formations");
  assert.equal(ordered.csharpRuntimeUnionSemantics, "native-ordered");
  assert.equal(sum.csharpRuntimeUnionSemantics, "source-sum");
  assert.equal(isCsharpRuntimeUnionTargetType(ordered) && isCsharpRuntimeUnionTargetType(sum), true);
  assert.equal(targetTypeRefEquals(ordered.typeArguments[0], text), true, "the native declaration keeps its first slot");
  assert.equal(targetTypeRefEquals(sum.typeArguments[0], text), true, "the source sum keeps the sealed first authored Source order");
});

test("only authored source sums flatten and deduplicate; an explicit native union stays an atomic arm", () => {
  const ordered = repeatedInteger;
  const inner = fixture.carrier("formations");
  const flattened = fixture.carrier("flattened");
  assert.equal(targetTypeRefEquals(flattened, inner), true, "nested source sums share one canonical identity");
  const mixed = fixture.carrier("mixed");
  const arms = getCsharpRuntimeUnionArms(mixed);
  assert.equal(arms.length, 2);
  assert.equal(arms.some(arm => arm === ordered), true, "no flattening or copy of the native generic struct");
  assert.equal(ordered.typeArguments.length === 2 && ordered.typeArguments.every(arm => arm === integer), true,
    "native repeated slots are not a one-arm source sum");
  assert.equal(targetTypeRefEquals(fixture.carrier("flattened", 1), integer), true,
    "a source sum of one exact identity needs no union");
});

test("semantic equality and keys retain the sum fact without changing native argument order", () => {
  const sum = fixture.carrier("generic");
  const reordered = fixture.carrier("generic", 1);
  const ordered = csharpRuntimeUnionTargetType(getCsharpRuntimeUnionArms(sum));
  assert.equal(targetTypeRefEquals(sum, reordered), true);
  assert.equal(targetTypeRefKey(sum), targetTypeRefKey(reordered));
  assert.equal(targetTypeRefEquals(sum, ordered), false, "equal physical slots cannot erase the source template's semantics");
  assert.notEqual(targetTypeRefKey(sum), targetTypeRefKey(ordered));
  assert.equal(getCsharpGenericSourceUnionParts(sum)?.members.length, 2,
    "open Source storage uses its retained physical projection rather than a fixed ordered CLR ABI");
  assert.equal(targetTypeRefEquals(csharpRuntimeUnionTargetType([text, parameter]),
    csharpRuntimeUnionTargetType([parameter, text])), false, "native generic parameters remain positional");
});

test("snapshots preserve the required fact and every ordered native duplicate payload", () => {
  const native = csharpRuntimeUnionTargetType([parameter, parameter]);
  const sum = fixture.carrier("generic", 2);
  const [snapshot] = snapshotCsharpTargetTypes([sum]);
  assert.equal(snapshot.csharpProjection.kind, "source-union");
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
  const sum = fixture.carrier("formations");
  const optional = fixture.carrier("absent");
  const present = getCsharpNullableElementTargetType(optional);
  assert.equal(present.csharpRuntimeUnionSemantics, "source-sum");
  assert.equal(targetTypeRefEquals(present, sum), true);
  assert.equal(getCsharpRuntimeUnionArms(present).length, 2);
  assert.equal(isCsharpTargetTypeRef(optional), true);
  assert.equal(combineCsharpTargetUnionMembers([integer, text]) === undefined, true,
    "the retired Native-only Source union factory cannot choose an authored order");
});
