// The deleted selected-type-evidence.ts reconciled an authored C# carrier with a checker-selected one (native integer
// vs checked bigint, broad source object vs native Object). That reconciliation was a dual path (AGENT-C1-NOTES D7);
// the Host now publishes one descriptor per slot and the one mapping represents it (nextgen C-2542 §2, I6, R2).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpBigIntegerTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const sourceText = `
import type { int64, uint64, int128, uint128, nativeInt, nativeUint, float64 } from "@tsonic/core/types.js";
export class Payload { amount: float64 = 1; }
export function wide(a: int64, b: uint64, c: int128, d: uint128, e: nativeInt, f: nativeUint, g: bigint): void {}
export function narrow(text: string, flag: boolean, real: float64): void {}
export function broad(value: unknown, object_: object, payload: Payload): void {}
`;

function fixture() {
  const program = hostProgram(sourceText);
  const at = representations(representationServices(program));
  const parameter = name => program.named(name, node => program.ast.is.IsParameterDeclaration(node));
  return { program, slot: name => represented(at.slot(parameter(name))) };
}

test("an authored native integer slot is represented by its own width; a plain bigint stays BigInteger", () => {
  const { program, slot } = fixture();
  const widths = { a: "int64", b: "uint64", c: "int128", d: "uint128", e: "native-int", f: "native-uint" };
  for (const [name, primitive] of Object.entries(widths)) {
    const descriptor = program.slot(program.named(name, node => program.ast.is.IsParameterDeclaration(node)));
    assert.equal(descriptor.kind === "primitive" && descriptor.primitive === primitive, true, `${name}: Host width`);
    assert.equal(targetTypeRefEquals(slot(name), csharpSourcePrimitiveTargetType(primitive)), true,
      `${name}: the native declaration owns its representation; no bigint replacement`);
  }
  assert.equal(targetTypeRefEquals(slot("g"), csharpBigIntegerTargetType()), true, "an authored bigint is not narrowed to a width");
});

test("non-integer slots keep their exact carriers", () => {
  const { slot } = fixture();
  assert.equal(targetTypeRefEquals(slot("text"), csharpStringTargetType()), true);
  assert.equal(targetTypeRefEquals(slot("flag"), csharpSourcePrimitiveTargetType("bool")), true);
  assert.equal(targetTypeRefEquals(slot("real"), csharpSourcePrimitiveTargetType("float64")), true);
});

test("a broad Source value is not a native Object ABI, and native payloads stay exact", () => {
  const { slot } = fixture();
  const unknown = slot("value");
  assert.equal(targetTypeRefEquals(unknown, csharpTsValueTargetType()), true, "unknown is the closed broad value carrier");
  assert.equal(targetTypeRefEquals(unknown, csharpObjectTargetType()), false, "broad storage never becomes System.Object");
  assert.equal(targetTypeRefEquals(slot("object_"), csharpObjectTargetType()), true, "the object keyword is native Object");
  const payload = slot("payload");
  assert.equal(payload.kind === "target-named" && payload.id === "global::Fixture.Payload", true,
    "a class payload is its exact project type, not a broad value");
});
