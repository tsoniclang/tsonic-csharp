// Runtime union carriers over Host sums (ported from the c2529 after-image, nextgen C-2542).
// A Host closed sum is represented positionally in the Host arm order (authored-first, C-2459); C# never sorts,
// dedupes or flattens arms (R6). An explicit native union (a provider/project generic struct) stays one atomic arm.
// The retired combineCsharpTargetUnionMembers (C# sum construction) is replaced by csharpSourceSumTargetType, which
// keeps exactly the arms it is given.
import assert from "node:assert/strict";
import test from "node:test";
import { csharpRuntimeUnionTargetType, csharpSourceSumTargetType, getCsharpRuntimeUnionArms,
  isCsharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { snapshotCsharpTargetTypes, isCsharpTargetTypeRef } from "../../../dist/target-model/types/snapshot.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { getCsharpGenericSourceUnionParts } from "../../../dist/target-model/types/projections.js";
import { fixtureProjectTypes, hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

const integer = csharpSourcePrimitiveTargetType("int64");
const text = csharpStringTargetType();
const repeatedInteger = csharpRuntimeUnionTargetType([integer, integer]);
const program = hostProgram(`
  import type { int64 } from "@tsonic/core/types.js";
  declare class Native<Value> { readonly value: Value; }
  declare class FixedNative { readonly value: int64; }
  declare function formations(value: string | int64): void;
  declare function flattened(value: (int64 | string) | int64 | string, duplicate: int64 | int64): void;
  declare function mixed(value: FixedNative | string): void;
  declare function generic<Value>(value: string | Value, reversed: Value | string, native: Native<Value> | string): void;
  declare function absent(value: int64 | string | undefined): void;
`);
// The two ambient classes stand for native generic structs: Native<V> is Union<V, V>, FixedNative is Union<long, long>.
const projectTypes = fixtureProjectTypes(program);
const natives = new Map([
  [program.named("Native"), arguments_ => csharpRuntimeUnionTargetType([arguments_[0], arguments_[0]])],
  [program.named("FixedNative"), () => repeatedInteger],
]);
const services = representationServices(program, { projectTypes: Object.freeze({ ...projectTypes,
  targetTypeForDeclaration: (declaration, arguments_) => natives.get(declaration)?.(arguments_) ??
    projectTypes.targetTypeForDeclaration(declaration, arguments_) }) });
const represent = representations(services);
const carrier = (name, index = 0) => represented(represent.slot(program.ast.parameters(program.named(name))[index]));
const parameter = csharpSourceTypeParameter(program.ast.typeParameters(program.named("generic"))[0], program.ast);

test("the existing union formations publish required source-sum versus ordered-native semantics", () => {
  const ordered = csharpRuntimeUnionTargetType([text, integer]);
  const sum = carrier("formations");
  assert.equal(ordered.csharpRuntimeUnionSemantics, "native-ordered");
  assert.equal(sum.csharpRuntimeUnionSemantics, "source-sum");
  assert.equal(isCsharpRuntimeUnionTargetType(ordered) && isCsharpRuntimeUnionTargetType(sum), true);
  assert.equal(targetTypeRefEquals(ordered.typeArguments[0], text), true, "the native declaration keeps its first slot");
  assert.equal(targetTypeRefEquals(sum.typeArguments[0], text), true, "the source sum keeps the authored-first Host order");
});

test("the Host flattens and dedupes the authored union; C# keeps its order, and an explicit native union stays one atomic arm", () => {
  const flattened = carrier("flattened");
  assert.deepEqual(getCsharpRuntimeUnionArms(flattened).map(targetTypeRefKey), [integer, text].map(targetTypeRefKey),
    "(int64 | string) | int64 | string is the Host sum int64 | string, first occurrence first");
  assert.equal(targetTypeRefEquals(flattened, carrier("formations")), false,
    "string | int64 and int64 | string are two positional carriers; no C# sort makes them one (R6)");
  const mixed = carrier("mixed");
  const arms = getCsharpRuntimeUnionArms(mixed);
  assert.equal(arms.length, 2);
  assert.equal(targetTypeRefEquals(arms[0], repeatedInteger) && arms[0].csharpRuntimeUnionSemantics === "native-ordered", true,
    "the native generic struct is one arm, in its authored position; no flattening or copy");
  assert.equal(repeatedInteger.typeArguments.length === 2 && repeatedInteger.typeArguments.every(arm => arm === integer), true,
    "native repeated slots are not a one-arm source sum");
  assert.equal(targetTypeRefEquals(carrier("flattened", 1), integer), true,
    "a source union of one identity is that identity (the Host publishes no sum)");
});

test("open sums keep the Host order in their projection; reversed authored orders are distinct carriers", () => {
  const sum = carrier("generic");
  const reversed = carrier("generic", 1);
  assert.equal(getCsharpGenericSourceUnionParts(sum)?.members.length, 2,
    "open Source storage uses its retained physical projection rather than a fixed ordered CLR ABI");
  assert.equal(targetTypeRefEquals(getCsharpGenericSourceUnionParts(sum).members[0], text) &&
    targetTypeRefEquals(getCsharpGenericSourceUnionParts(reversed).members[1], text), true,
  "string | Value and Value | string keep their authored arm positions");
  assert.notEqual(targetTypeRefKey(sum), targetTypeRefKey(reversed), "no order-insensitive key is invented in C#");
  assert.equal(targetTypeRefEquals(csharpRuntimeUnionTargetType([text, parameter]),
    csharpRuntimeUnionTargetType([parameter, text])), false, "native generic parameters remain positional");
});

test("snapshots preserve the required fact and every ordered native duplicate payload", () => {
  const sum = carrier("generic", 2);
  const [snapshot] = snapshotCsharpTargetTypes([sum]);
  assert.equal(snapshot.csharpProjection.kind, "source-union");
  assert.equal(targetTypeRefEquals(snapshot, sum), true);
  const nested = getCsharpGenericSourceUnionParts(snapshot).members.find(arm => isCsharpRuntimeUnionTargetType(arm));
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

test("absence stays outside the source sum without changing its native payload slots", () => {
  const optional = carrier("absent");
  const present = getCsharpNullableElementTargetType(optional);
  assert.equal(present.csharpRuntimeUnionSemantics, "source-sum");
  assert.deepEqual(getCsharpRuntimeUnionArms(present).map(targetTypeRefKey), [integer, text].map(targetTypeRefKey),
    "int64 | string | undefined -> Nullable<Union<long, string>> in Host order (A11 absence lifted)");
  assert.equal(isCsharpTargetTypeRef(optional), true);
});

test("the C# sum factory keeps exactly the arms it is given: no sort, no dedupe (R6)", () => {
  const reversed = csharpSourceSumTargetType([text, integer]);
  assert.deepEqual(reversed.typeArguments.map(targetTypeRefKey), [text, integer].map(targetTypeRefKey));
  assert.equal(csharpSourceSumTargetType([integer, integer]).typeArguments.length, 2,
    "duplicate arms are not merged in C#; the representation refuses them (CSHARP_UNION_ARMS_INDISTINGUISHABLE)");
  assert.equal(csharpSourceSumTargetType([integer]), undefined, "one present arm is not a runtime union");
});
