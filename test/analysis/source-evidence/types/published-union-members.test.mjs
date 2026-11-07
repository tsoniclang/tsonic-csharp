// Published union members (c2529 acceptance, ported to the nextgen facts, C-2542). The Host closed sum (E3) owns
// arm order, roles, widths and the absence arm; C# reads those arms positionally (R6) and maps each with the one
// mapping (I6). There is no member lookup by carrier and no checked retry: a missing sum is an invariant failure (I4).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";

let retained;
function fixture() {
  if (retained !== undefined) return retained;
  const program = hostProgram([
    "export function read(value: undefined | string | int32): undefined | string | int32 { return value; }",
    "export function foreign(value: string | uint32): string | uint32 { return value; }",
  ].join("\n"));
  const parameter = program.ast.parameters(program.named("read"))[0];
  const descriptor = program.type(parameter);
  assert.equal(descriptor.kind, "optional", "the original width and absence have their Host publication");
  const sum = program.sum(descriptor);
  const services = representationServices(program);
  const represent = representations(services);
  const carrier = represented(represent.value(parameter));
  retained = { program, parameter, descriptor, sum, services, represent, carrier };
  return retained;
}

test("published union members keep the Host arms, roles and native widths positionally", () => {
  const input = fixture();
  const { sum } = input;
  assert.equal(sum.arms.length, 3, "all Source arms, including absence, stay indexed");
  assert.deepEqual(sum.arms.map(arm => arm.type.kind === "intrinsic" ? arm.type.intrinsic : arm.type.kind === "primitive"
    ? arm.type.primitive : arm.type.kind), ["absence", "string", "int32"], "authored-first arm order (C-2459)");
  for (const [index, arm] of sum.arms.entries()) {
    assert.equal(sum.roles.find(role => role.role === arm.role).arms.includes(index), true,
      "the role identity and the closed arm index are separate published facts");
  }
  const present = getCsharpNullableElementTargetType(input.carrier);
  assert.notEqual(present, undefined, "the absence arm lifts the present union to Nullable");
  const arms = getCsharpRuntimeUnionArms(present);
  assert.deepEqual(arms.map(targetTypeRefKey), [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int32")].map(targetTypeRefKey),
    "present arms are positional in Host order; the int32 arm is not widened to the checker number category");
  assert.equal(present.csharpRuntimeUnionSemantics, "source-sum");
  assert.equal(arms.filter(isCsharpAbsenceTargetType).length, 0, "the absence index carries no payload and no second nullish variant");
  for (const [index, arm] of sum.arms.entries()) {
    const selected = represented(input.represent.type(arm.type, input.parameter, "value"));
    if (index === 0) assert.equal(isCsharpAbsenceTargetType(selected), true);
    else assert.equal(targetTypeRefEquals(selected, arms[index - 1]), true, "each Source arm maps to its positional .NET arm");
  }
});

test("a union descriptor without its published sum is an invariant failure, and a Host refusal is forwarded", () => {
  const input = fixture();
  const services = representationServices(input.program, {
    facts: Object.freeze({ ...input.program.facts, sums: Object.freeze({ ...input.program.facts.sums, sumOf: () => undefined }) }),
  });
  const union = input.descriptor.value;
  assert.equal(union.kind, "union");
  assert.throws(() => representations(services).type(union, input.parameter, "value"), /published closed sum/u,
    "a missing family never retries a checked or carrier-based reconstruction (I4)");
  const refusal = Object.freeze({ kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_CONFLICT",
    site: input.parameter, reason: "retained Host refusal" });
  const refused = representationServices(input.program, {
    facts: Object.freeze({ ...input.program.facts, values: Object.freeze({ ...input.program.facts.values,
      type: node => node === input.parameter ? refusal : input.program.facts.values.type(node) }) }),
  });
  assert.equal(representations(refused).value(input.parameter), refusal, "the Host refusal is forwarded unchanged (R5)");
});
