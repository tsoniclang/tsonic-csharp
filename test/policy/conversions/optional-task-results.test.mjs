// Optional Task lifting (ported from the c2529 after-image, nextgen C-2542). The optional Task carrier is the
// representation of the Host publication of `Promise<void> | void` (A11: the void arm is absence -> Task?), never a
// C# union combine (the deleted combineCsharpTargetUnionMembers, R6). The awaited result is the Host one
// (facts.values.awaited of the real `await`), represented.
import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { selectCsharpAwaitCompletion } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { csharpRepresentationContext, representAwaited } from "../../../dist/representation/index.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType,
  csharpTaskTargetType, csharpVoidTargetType, csharpSourcePrimitiveTargetType,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

const program = hostProgram(`
  import type { int32 } from "@tsonic/core/types.js";
  export async function optionalResult(value: Promise<void> | void): Promise<void> { await value; }
  export async function optionalInteger(value: Promise<int32> | undefined): Promise<int32 | undefined> { return await value; }
`);
const services = representationServices(program);
const represent = representations(services);
const parameter = name => program.ast.parameters(program.named(name))[0];
const awaitIn = name => {
  const owner = program.named(name);
  return program.nodes.find(node => program.ast.is.IsAwaitExpression(node) &&
    program.ast.pos(node) > program.ast.pos(owner) && program.ast.end(node) <= program.ast.end(owner));
};
const awaited = name => represented(representAwaited(awaitIn(name), csharpRepresentationContext(services, awaitIn(name), "value")));

test("optional Task lifting preserves arity, payload and non-null requirements", () => {
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, target: {} };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const unit = csharpVoidTargetType();
  const task = csharpTaskTargetType(unit);
  assert.equal(program.slot(parameter("optionalResult")).kind, "optional", "the actual Promise<void> | void has one Source absence (A11)");
  const optional = represented(represent.slot(parameter("optionalResult")));
  assert.ok(targetTypeRefEquals(optional, csharpNullableTargetType(task)), "Promise<void> | void -> Task? (A11)");
  assert.deepEqual(selectCsharpConversion(policy, task, optional, "implicit"), { kind: "implicit", proof: "nullable" });
  assert.deepEqual(selectCsharpConversion(policy, csharpAbsenceTargetType(), optional, "implicit"), { kind: "absence" });
  assert.equal(selectCsharpConversion(policy, csharpTaskTargetType(integer), optional, "implicit").kind, "implicit");
  for (const [source, target] of [[optional, task],
    [task, csharpTaskTargetType(integer)], [csharpTaskTargetType(integer), csharpTaskTargetType(boolean)],
    [integer, optional], [unit, optional]]) {
    assert.equal(selectCsharpConversion(policy, source, target, "implicit").kind, "rejected");
  }
  const adapter = selectCsharpConversion(policy, csharpDelegateTargetType("System.Action", []), csharpDelegateTargetType("System.Func", [], optional), "implicit");
  assert.equal(adapter.kind, "delegate-adapter");
  assert.deepEqual(adapter.returnConversion, { kind: "void-return" });
  const voidAwait = selectCsharpAwaitCompletion(optional, awaited("optionalResult"), undefined, "consumed");
  assert.ok(targetTypeRefEquals(voidAwait?.result, unit), "awaiting Task? completes with the Host awaited void");
  const integerOptional = represented(represent.slot(parameter("optionalInteger")));
  assert.ok(targetTypeRefEquals(integerOptional, csharpNullableTargetType(csharpTaskTargetType(integer))));
  const integerAwait = selectCsharpAwaitCompletion(integerOptional, awaited("optionalInteger"), undefined, "consumed");
  assert.ok(targetTypeRefEquals(integerAwait?.result, csharpNullableTargetType(integer)),
    "awaiting Task<int>? completes with the Host awaited int? (absence retained)");
  assert.equal(integerAwait.optional, true, "the receiver absence is the native Nullable wrapper");
});
