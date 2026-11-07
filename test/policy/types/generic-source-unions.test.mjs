// Generic and literal source unions (nextgen C-2542). An object literal written into a union selects one Host arm
// (facts.relations.at, "select-arm", literal discriminant, C-2479). Zero or several matching arms is a Source refusal
// from the Host, never a C# carrier search. Narrowing (discriminant, nullish) is a Host test relation plus a published
// narrowed type. A void arm is absence (A11). C# keeps only the CLR parts: generic binding inference over carriers,
// shape substitution and the nullable conversion of a union struct.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const byte = { kind: "source-primitive", name: "uint8" };
const integer = { kind: "source-primitive", name: "int32" };
const parameter = { kind: "type-parameter", identity: "Element", name: "Element" };
const arm = (name, argument) => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: name, typeArguments: [argument] });

const program = hostProgram(`
  import type { uint8, int64 } from "@tsonic/core/types.js";
  interface First { kind: "first"; value: uint8; }
  interface Second { kind: "second"; value: uint8; }
  interface Left { value: string; }
  interface Right { value: string; }
  const selected: First | Second = { kind: "first", value: 1 };
  const ambiguous: Left | Right = { value: "x" };
  const record: Record<string, int64> | string = { entry: 1 };
  declare function observe(value: unknown): void;
  export function refine(value: First | Second, maybe: uint8 | undefined): void {
    if (value.kind === "first") observe(value);
    if (maybe !== undefined) observe(maybe);
  }
  class Later {}
  type Outcome = void | string | Later;
  declare const outcome: Outcome;
`);
const { ast, nodes, facts } = program;
const variable = name => program.named(name, node => ast.is.IsVariableDeclaration(node));
const initializer = name => nodes.find(node => ast.is.IsObjectLiteralExpression(node) && ast.parent(node) === variable(name));
const represent = representations(representationServices(program));

test("an object literal written into a union selects the one Host arm whose literal discriminant matches", () => {
  const relation = facts.relations.at(initializer("selected"));
  assert.equal(relation?.kind, "select-arm");
  const sum = facts.sums.sum(relation.sum);
  assert.equal(sum.arms[relation.arm].type.declaration, program.named("First", node => ast.is.IsInterfaceDeclaration(node)),
    "the discriminant 'first' selects First by declaration, not by member spelling");
  assert.deepEqual(relation.discriminant && { property: relation.discriminant.property, text: relation.discriminant.value.text },
    { property: "kind", text: "first" });
});

test("several structurally matching arms are a Host refusal, never a C# arm choice", () => {
  const relation = facts.relations.at(initializer("ambiguous"));
  assert.equal(relation?.kind, "refused", "zero or several matches is a Source refusal (C-2479)");
  assert.equal(relation.code.startsWith("TSONIC_"), true, "the refusal is Host-originated (I7)");
  assert.equal(facts.refusals().some(refusal => refusal.code === relation.code && refusal.site === relation.site), true,
    "the refusal is published once in the program refusals");
});

test("an indexed record arm is selected by the Host and keeps its exact .NET carrier", () => {
  const literal = initializer("record");
  const relation = facts.relations.at(literal);
  assert.equal(relation?.kind, "select-arm");
  const sum = facts.sums.sum(relation.sum);
  const storage = represented(represent.slot(variable("record")));
  const selectedArm = represented(represent.type(sum.arms[relation.arm].type, literal, "storage"));
  assert.equal(targetTypeRefEquals(getCsharpRuntimeUnionArms(storage)[relation.arm], selectedArm), true,
    "the selected arm's carrier is the positional runtime arm");
});

test("generic nullable union inference uses one exact arm and retains concrete widths", () => {
  const pattern = csharpNullableTargetType(csharpRuntimeUnionTargetType([arm("Value", parameter), arm("Pointer", parameter)]));
  const parameters = new Set(["Element"]);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(pattern, arm("Value", byte), parameters), new Map([["Element", byte]]));
  const both = csharpRuntimeUnionTargetType([arm("Value", byte), arm("Pointer", byte)]);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(pattern, both, parameters), new Map([["Element", byte]]));
  const conflict = csharpRuntimeUnionTargetType([arm("Value", byte), arm("Pointer", integer)]);
  assert.equal(inferCsharpTargetTypeParameterBindings(pattern, conflict, parameters), undefined);
  assert.equal(inferCsharpTargetTypeParameterBindings(pattern, arm("Unknown", byte), parameters), undefined);
  const ambiguous = csharpRuntimeUnionTargetType([arm("Value", parameter), arm("Value", byte)]);
  assert.equal(inferCsharpTargetTypeParameterBindings(ambiguous, arm("Value", byte), parameters), undefined);
});

test("shape substitution keeps one symbolic declaration through multiple instantiations", () => {
  const declaration = {};
  const original = { targetType: arm("Value", parameter), members: [{
    sourceName: "value", sourceKey: { kind: "property", name: "value" },
    sourceDeclarations: [declaration], targetName: "value", memberKind: "property", type: parameter,
  }] };
  const renamed = substituteObjectShapeFactTargetTypeParameters(original, new Map([["Element", { kind: "type-parameter", identity: "Item", name: "Item" }]]));
  const selected = substituteObjectShapeFactTargetTypeParameters(renamed, new Map([["Item", byte]]));
  assert.equal(selected.declarationTemplate, original);
  assert.deepEqual(selected.targetType, arm("Value", byte));
  assert.deepEqual(selected.members[0].type, byte);
  assert.equal(selected.members[0].sourceDeclarations[0], declaration);
  assert.deepEqual(original.members[0].type, parameter);
});

test("discriminant narrowing is a Host test relation and the narrowed read is the one arm's declaration", () => {
  const comparison = nodes.find(node => ast.is.IsBinaryExpression(node) && ast.text(node) === 'value.kind === "first"');
  const relation = facts.relations.at(comparison);
  assert.equal(relation?.kind, "test");
  assert.deepEqual([...relation.whenTrue], [0], "exactly the First arm survives");
  const reads = nodes.filter(node => ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "observe")
    .map(call => ast.arguments(call)[0]);
  const narrowed = program.type(reads[0]);
  assert.equal(narrowed.kind === "declared" && narrowed.declaration === program.named("First", node => ast.is.IsInterfaceDeclaration(node)), true);
  assert.equal(represented(represent.value(reads[0])).id, "global::Fixture.First");
});

test("nullish narrowing keeps the native payload only for the complete non-nullish selection", () => {
  const reads = nodes.filter(node => ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "observe")
    .map(call => ast.arguments(call)[0]);
  const comparison = nodes.find(node => ast.is.IsBinaryExpression(node) && ast.text(node) === "maybe !== undefined");
  const relation = facts.relations.at(comparison);
  assert.equal(relation?.kind, "test");
  const sum = facts.sums.sum(relation.sum);
  assert.equal(relation.whenTrue.every(index => !(sum.arms[index].type.kind === "intrinsic" && sum.arms[index].type.intrinsic === "absence")),
    true, "the absence arm is excluded when the test holds");
  assert.equal(targetTypeRefEquals(represented(represent.value(reads[1])), byte), true, "the narrowed read is the exact uint8");
  const declared = represented(represent.slot(ast.parameters(program.named("refine", node => ast.is.IsFunctionDeclaration(node)))[1]));
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(declared), byte), true, "the declared storage keeps its one absence");
});

test("a void union arm is the nullable union's one absence, never a present payload (A11)", () => {
  const descriptor = program.slot(variable("outcome"));
  const sum = program.sum(descriptor);
  assert.equal(sum.arms.some(entry => entry.type.kind === "intrinsic" && entry.type.intrinsic === "void"), false,
    "the Host publishes void as absence");
  assert.equal(sum.arms.filter(entry => entry.type.kind === "intrinsic" && entry.type.intrinsic === "absence").length, 1);
  const carrier = represented(represent.slot(variable("outcome")));
  const present = getCsharpNullableElementTargetType(carrier);
  assert.notEqual(present, undefined, "absence lifts the union to Nullable");
  const arms = getCsharpRuntimeUnionArms(present);
  assert.equal(arms.length === 2 && targetTypeRefEquals(arms[0], csharpStringTargetType()) && arms[1].id === "global::Fixture.Later", true,
    "string and Later stay positional after the leading absence arm");
});

test("nullable union conversion never confuses nullability with selecting an arm", () => {
  const union = csharpRuntimeUnionTargetType([byte, integer]);
  const nullable = csharpNullableTargetType(union);
  // Union`N is a readonly struct: wrapping it in Nullable<T> is the implicit nullable conversion, never an arm selection.
  assert.deepEqual(selectCsharpConversion({}, union, nullable, "implicit"), { kind: "implicit", proof: "nullable" });
  assert.equal(selectCsharpConversion({}, nullable, union, "explicit").kind, "nullable-value");
  assert.equal(selectCsharpConversion({}, nullable, union, "implicit").kind, "rejected");
});
