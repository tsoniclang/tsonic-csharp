// Call results and their await completions (nextgen C-2542, I2, I6).
// A call's value type is the Host one (facts.values.type(call) / callableReturn) and the result of `await e` is the
// Host awaited result (facts.values.awaited). C# represents both and maps each task/value alternative of the operand
// carrier onto the represented awaited result (selectCsharpAwaitCompletion). The old C# reconciliation of a native
// result with a checker-selected result (selectCsharpSourceCallResult / declaration adoption) was a dual path and is
// gone: there is exactly one source of the call result, and C# never re-selects a nominal or broad carrier.
import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpAwaitCompletion } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType, getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

const program = hostProgram(`
export class Base { tag: string = "base"; }
export class Child extends Base { extra: string = "child"; }
declare function external(): Promise<string>;
export async function direct(): Promise<string> { return "x"; }
export function mixed(flag: boolean): Promise<string> | string { return flag ? direct() : "y"; }
export function maybe(flag: boolean): Promise<string> | undefined { return flag ? direct() : undefined; }
export function make(): Base { return new Child(); }
export function broad(): unknown { return 7; }
export async function use(flag: boolean): Promise<string> {
  const a = await direct();
  const b = await mixed(flag);
  const c = await maybe(flag);
  const d = await external();
  const e = make();
  const f = broad();
  return a + b + (c ?? "") + d + e.tag + String(f);
}
`);
const represent = representations(representationServices(program));
const string = csharpStringTargetType();
const { ast, facts } = program;
const awaits = program.nodes.filter(node => ast.is.IsAwaitExpression(node));
const awaitOf = name => awaits.find(node => ast.text(node).startsWith(`await ${name}(`));
const awaited = node => {
  const outcome = facts.values.awaited(node);
  assert.notEqual(outcome.kind, "refused", "the Host publishes the awaited result of a supported await");
  return represented(represent.type(outcome.type, node, "value"));
};
const operand = node => represented(represent.value(ast.as.AsAwaitExpression(node).Expression));

test("a declared source call awaits exactly one native Task layer to the Host awaited result", () => {
  const node = awaitOf("direct");
  assert.equal(targetTypeRefEquals(represented(represent.callableReturn(program.named("direct"))), csharpTaskTargetType(string)), true);
  assert.equal(targetTypeRefEquals(operand(node), csharpTaskTargetType(string)), true, "the call value is the Host call type");
  const result = awaited(node);
  assert.equal(targetTypeRefEquals(result, string), true);
  const completion = selectCsharpAwaitCompletion(operand(node), result, undefined, "consumed");
  assert.equal(completion.form, "direct");
  assert.equal(completion.result === result, true, "the completion result is the represented Host awaited result");
  assert.equal(completion.alternatives.length === 1 && completion.alternatives[0].task, true, "one Unwrap, never a second");
  assert.equal(completion.optional, false);
});

test("a Task-or-value union awaits per Host arm without changing the physical ABI", () => {
  const node = awaitOf("mixed");
  const carrier = operand(node);
  const sum = program.sum(program.callableReturn(program.named("mixed")));
  assert.deepEqual(sum.arms.map(arm => arm.type.kind), ["declared", "string"], "Host order is authored-first (C-2459)");
  assert.deepEqual(getCsharpRuntimeUnionArms(carrier).map(targetTypeRefKey),
    [csharpTaskTargetType(string), string].map(targetTypeRefKey), "the runtime union keeps the Host arm order (R6)");
  const completion = selectCsharpAwaitCompletion(carrier, awaited(node), undefined, "consumed");
  assert.equal(completion.form, "branches");
  assert.deepEqual(completion.alternatives.map(alternative => alternative.task), [true, false]);
  assert.equal(completion.alternatives.every(alternative => targetTypeRefEquals(alternative.result, string)), true);
  assert.equal(completion.excludeUnmatched, true, "each alternative is read from its own runtime-union arm");
  assert.equal(Object.isFrozen(completion) && Object.isFrozen(completion.alternatives), true);
});

test("an optional Task preserves absence through the completion (A11)", () => {
  const node = awaitOf("maybe");
  const carrier = operand(node);
  assert.equal(targetTypeRefEquals(carrier, csharpNullableTargetType(csharpTaskTargetType(string))), true);
  const result = awaited(node);
  assert.equal(targetTypeRefEquals(result, csharpNullableTargetType(string)), true, "the Host awaited result keeps absence");
  const completion = selectCsharpAwaitCompletion(carrier, result, undefined, "consumed");
  assert.equal(completion.optional, true);
  assert.equal(targetTypeRefEquals(completion.result, csharpNullableTargetType(string)), true);
  assert.equal(completion.alternatives.length === 1 && completion.alternatives[0].task, true);
});

test("an ambient declaration's physical Task is awaited the same single way", () => {
  const node = awaitOf("external");
  assert.equal(targetTypeRefEquals(operand(node), csharpTaskTargetType(string)), true);
  assert.equal(selectCsharpAwaitCompletion(operand(node), awaited(node), undefined, "consumed").form, "direct");
});

test("nominal and broad call results are the Host types; C# never re-selects a narrower carrier", () => {
  const make = ast.as.AsVariableDeclaration(program.named("e")).Initializer;
  const result = represented(represent.value(make));
  assert.equal(result.kind === "target-named" && result.id === "global::Fixture.Base", true,
    "a call declared to return Base is Base, even though it builds a Child");
  const broad = ast.as.AsVariableDeclaration(program.named("f")).Initializer;
  assert.equal(targetTypeRefEquals(represented(represent.value(broad)), csharpTsValueTargetType()), true,
    "an unknown result stays the broad TsValue carrier");
});

test("an await completion without a carrier or over an opaque payload selects nothing", () => {
  assert.equal(selectCsharpAwaitCompletion(undefined, string), undefined);
  assert.equal(selectCsharpAwaitCompletion({ kind: "opaque", id: "fixture" }, string), undefined);
});
