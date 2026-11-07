// The deleted C# type-resolution query cache (resolution/query-cache.ts) memoized checker-derived answers per
// (node, source file, purpose), including rejections. Its protected behaviours now belong to the Host publication and
// the per-view representation services (nextgen C-2542 §2, I4, I5): one frozen answer per node and per sum identity,
// separate value and storage purposes, refusals published once and forwarded unchanged, no state shared across views.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

const sourceText = `
import type { int32, int64 } from "@tsonic/core/types.js";
export function choose(flag: boolean, wide: int64): int64 | int32 | undefined {
  let slot: int64 | undefined = flag ? wide : undefined;
  if (slot !== undefined) return slot;
  const pair: int32 | string = flag ? (1 as int32) : "one";
  return typeof pair === "string" ? undefined : pair;
}
function emptyBuffer() { return []; }
export function size(): number { return emptyBuffer().length; }
`;

test("a value node has one frozen Host answer per program view, read any number of times", () => {
  const program = hostProgram(sourceText);
  const slot = program.named("slot");
  const first = program.facts.values.type(slot);
  assert.equal(first.kind !== "refused" && Object.isFrozen(first) && Object.isFrozen(first.type), true,
    "the Host publication is immutable");
  assert.deepEqual(program.facts.values.type(slot), first, "a repeated read returns the same published answer");
  const at = representations(representationServices(program));
  assert.equal(targetTypeRefKey(represented(at.slot(slot))), targetTypeRefKey(represented(at.slot(slot))),
    "repeated representation of the same slot is the same .NET type");
});

test("a sum identity has one frozen record per program view (the Host replaces the C# union memo)", () => {
  const program = hostProgram(sourceText);
  const sum = program.sum(program.callableReturn(program.named("choose")));
  assert.equal(program.facts.sums.sum(sum.identity) === program.facts.sums.sum(sum.identity), true,
    "the same frozen record for the same identity (SourceSumFacts.sum contract)");
  assert.equal(Object.isFrozen(sum) && Object.isFrozen(sum.arms), true);
});

test("value and storage are different purposes: a narrowed read differs from its declared slot", () => {
  const program = hostProgram(sourceText);
  const at = representations(representationServices(program));
  const declaration = program.named("slot");
  const narrowed = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === "slot" &&
    program.ast.is.IsReturnStatement(program.ast.parent(node)));
  assert.notEqual(narrowed, undefined, "the narrowed read exists");
  const int64 = csharpSourcePrimitiveTargetType("int64");
  assert.equal(targetTypeRefEquals(represented(at.slot(declaration)), csharpNullableTargetType(int64)), true,
    "the slot keeps its declared absence");
  assert.equal(targetTypeRefEquals(represented(at.value(narrowed)), int64), true,
    "the narrowed value read is the present arm only");
});

test("a Host refusal is published once with its site and forwarded unchanged by representation", () => {
  const program = hostProgram(sourceText);
  const literal = program.nodes.find(node => program.ast.is.IsArrayLiteralExpression(node));
  const refused = program.facts.values.type(literal);
  assert.equal(refused.kind, "refused", "an untyped empty array literal has no Host descriptor");
  assert.equal(refused.code, "TSONIC_UNTYPED_ARRAY_LITERAL");
  assert.equal(refused.site !== undefined && Object.isFrozen(refused), true);
  assert.deepEqual(program.facts.values.type(literal), refused, "the same refusal on every read");
  const forwarded = representations(representationServices(program)).value(literal);
  assert.equal(forwarded.kind === "refused" && forwarded.code === refused.code && forwarded.site === refused.site, true,
    "the C# entry forwards the Host refusal; it never retries another route (R5)");
});

test("no answer is shared between program views (I5)", () => {
  const left = hostProgram(sourceText);
  const right = hostProgram(sourceText);
  assert.notEqual(left.facts, right.facts);
  const leftSum = left.sum(left.callableReturn(left.named("choose")));
  const rightSum = right.sum(right.callableReturn(right.named("choose")));
  assert.notEqual(leftSum, rightSum, "each view owns its sum records");
  const leftServices = representationServices(left);
  const rightServices = representationServices(right);
  assert.notEqual(leftServices.recursiveAliases, rightServices.recursiveAliases, "representation state lives per view");
  assert.equal(targetTypeRefKey(represented(representations(leftServices).sum(leftSum, left.named("choose"), "return"))),
    targetTypeRefKey(represented(representations(rightServices).sum(rightSum, right.named("choose"), "return"))),
    "equal programs map to equal .NET types");
});
