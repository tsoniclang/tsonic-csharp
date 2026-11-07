// Discriminant literals in generated shape identity (nextgen C-2542; R-A5-1).
// The Host publishes a shape member's literal domain (`SourceTypeDescriptorMember.literals`, base `type`), so
// `{ kind: "left"; v: number } | { kind: "right"; v: number }` stays two Host arms. C# must keep them two .NET classes:
// the member literal keys join the generated shape identity (target-model/types/object-shape-identity.ts), the member's
// C# type stays the base type, and a genuine duplicate still maps to one class. This union compiles at baseline, so a
// CSHARP_UNION_ARMS_INDISTINGUISHABLE refusal here would be a new refusal (R11).
import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapePolicy } from "../../dist/analysis/objects/shapes/api.js";
import { getCsharpRuntimeUnionArms } from "../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../dist/target-model/types/equality.js";
import { isCsharpStringTargetType } from "../../dist/target-model/types/identity.js";
import { hostProgram, representationServices, representations, represented } from "./host-fixture.mjs";

function fixture() {
  const program = hostProgram(`type Move = { kind: "left"; v: number } | { kind: "right"; v: number };
type Twice = { kind: "left"; v: number } | { kind: "left"; v: number };
type Left = { kind: "left"; v: number };
type AlsoLeft = { kind: "left"; v: number };
export function run(): Move { const moved: Move = { kind: "right", v: 1 }; return moved; }
export function same(first: Left, second: AlsoLeft, twice: Twice): void { void first; void second; void twice; }`);
  let shapes;
  const services = representationServices(program, { shapes: Object.freeze({
    retainShape: shape => shapes.retainShape(shape), resolveCallableValue: () => assert.fail("no callable members") }) });
  const sourceStorage = new Proxy({}, { get: (_target, key) => () => assert.fail(`data shapes read no storage (${String(key)})`) });
  shapes = createCsharpObjectShapePolicy({ ast: program.ast, sourceStorage, projectTypeCatalog: services.projectTypes,
    typeParameterConstraints: services.typeParameters, representation: () => services });
  return { program, shapes, represent: representations(services) };
}

const member = (shape, name) => {
  const found = shape.members.filter(candidate => candidate.sourceName === name);
  assert.equal(found.length, 1, `exactly one member '${name}'`);
  return found[0];
};

test("two arms that differ only in a discriminant literal are two .NET classes with base-typed members", () => {
  const { program, shapes, represent } = fixture();
  const carrier = represented(represent.slot(program.named("moved")));
  const arms = getCsharpRuntimeUnionArms(carrier);
  assert.equal(arms?.length, 2, "the Host's two arms stay two runtime union arms (no CSHARP_UNION_ARMS_INDISTINGUISHABLE)");
  assert.notEqual(targetTypeRefKey(arms[0]), targetTypeRefKey(arms[1]), "each arm has its own generated class");
  const [left, right] = arms.map(arm => shapes.resolveTarget(arm));
  assert.equal(left !== undefined && right !== undefined, true, "both arm classes are registered shapes");
  assert.equal(isCsharpStringTargetType(member(left, "kind").type) && isCsharpStringTargetType(member(right, "kind").type), true,
    "the discriminant member's C# type stays the base type string");
  assert.equal(targetTypeRefEquals(member(left, "v").type, member(right, "v").type), true, "the payload member has one width");
  assert.deepEqual(member(left, "kind").literals?.map(literal => literal.value), ["left"], "authored-first arm order: left");
  assert.deepEqual(member(right, "kind").literals?.map(literal => literal.value), ["right"]);
});

test("a genuine duplicate shape still maps to one .NET class", () => {
  const { program, represent } = fixture();
  const first = represented(represent.slot(program.named("first")));
  assert.equal(targetTypeRefEquals(represented(represent.slot(program.named("second"))), first), true,
    "two declarations of the same member set and literal domain are one generated class");
  assert.equal(targetTypeRefEquals(represented(represent.slot(program.named("twice"))), first), true,
    "a union of two identical arms is one Host arm and one class, never a refused two-arm union");
});

test("the object literal { kind: \"right\", v: 1 } constructs the right arm class", () => {
  const { program, shapes, represent } = fixture();
  const moved = program.named("moved");
  const arms = getCsharpRuntimeUnionArms(represented(represent.slot(moved)));
  const literal = program.ast.as.AsVariableDeclaration(moved).Initializer;
  const outcome = program.facts.values.type(literal);
  assert.equal(outcome.kind !== "refused", true, "the literal is published");
  const constructed = represented(represent.type(outcome.construction ?? outcome.type, literal, "storage"));
  assert.equal(targetTypeRefEquals(constructed, arms[1]), true, "the literal's construction is the selected right arm class");
  assert.equal(targetTypeRefEquals(constructed, arms[0]), false, "never the left arm class");
  assert.deepEqual(member(shapes.resolveTarget(constructed), "kind").literals?.map(literal => literal.value), ["right"]);
});
