// Indexed access types over generic interfaces (nextgen C-2542, I2, I6). The Host resolves `Box<int64>[K]` to a
// descriptor (member, optional member, index signature) and publishes it; C# represents the published descriptor
// only. The former C# path (provider member relations + checker indexed-type evidence, closing native generics in C#)
// is gone: there is no "provider-indexed-type-evidence-unavailable" carrier any more, because C# no longer answers
// the Source question.
import assert from "node:assert/strict";
import test from "node:test";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

const integer = csharpSourcePrimitiveTargetType("int64");

function selected(keys, members = "value: T; other: T; optional?: T;") {
  const program = hostProgram(`import type { int64 } from "@tsonic/core/types.js";
export interface Box<T> { ${members} readonly [key: string]: T | string | undefined }
export type Selected = Box<int64>[${keys}];
export function read(box: Box<int64>, key: ${keys}): Selected { return box[key] as Selected; }
`);
  const read = program.named("read");
  const descriptor = program.callableReturn(read);
  return { program, descriptor, carrier: represented(representations(representationServices(program)).type(descriptor, read, "return")) };
}

test("an indexed access over a generic interface represents the Host-resolved member type", () => {
  assert.equal(targetTypeRefEquals(selected('"value"').carrier, integer), true);
  assert.equal(targetTypeRefEquals(selected('"value" | "other"').carrier, integer), true, "equal member types are one type");
  assert.equal(targetTypeRefEquals(selected('"optional"').carrier, csharpNullableTargetType(integer)), true,
    "an optional member read includes absence (A11 lift to long?)");
});

test("different member types stay a Host sum; C# maps its arms positionally and does not reconcile or reject them", () => {
  const { program, descriptor, carrier } = selected('"value" | "other"', "value: T; other: string; optional?: T;");
  const union = descriptor.kind === "declared" ? descriptor.definition : descriptor;
  const sum = program.sum(union);
  const expected = sum.arms.map(arm => arm.type.kind === "string" ? csharpStringTargetType() : csharpSourcePrimitiveTargetType(arm.type.primitive));
  assert.deepEqual(sum.arms.map(arm => arm.type.kind).sort(), ["primitive", "string"], "the Host sum is int64 | string");
  const arms = getCsharpRuntimeUnionArms(carrier);
  assert.notEqual(arms, undefined, "two member types are a closed sum, not a provider-evidence refusal");
  assert.deepEqual(arms.map(targetTypeRefKey), expected.map(targetTypeRefKey), "arm i of the carrier is arm i of the Host sum (R6)");
  assert.equal(carrier.kind === "opaque", false);
});
