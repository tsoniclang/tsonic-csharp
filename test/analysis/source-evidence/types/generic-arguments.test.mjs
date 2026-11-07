// Generic arguments (nextgen C-2542). The retired C# binders rebuilt declaration and receiver bindings from checked
// types. The Host publishes every application: a declared descriptor carries its complete argument vector (dependent
// defaults filled), and each construction or call carries its instantiation (facts.instantiations.at, G4) keyed by
// binder declaration. C# represents those arguments positionally (representInstantiation, I6) and refuses an argument
// vector whose length differs from the .NET definition (CSHARP_TYPE_ARGUMENT_ARITY).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { csharpRepresentationContext, representInstantiation } from "../../../../dist/representation/index.js";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";

const sourceText = `
  import type { uint8 } from "@tsonic/core/types.js";
  class Pair<Input, Output = Input> {}
  type Actual = bigint;
  const made = new Pair<Actual>();
  const held: Pair<Actual> = made;
  class Two<First, Second> { constructor(first: First, second: Second) {} }
  const ordered = new Two<bigint, uint8>(1n, 2 as uint8);
`;

function fixture() {
  const program = hostProgram(sourceText);
  const services = representationServices(program);
  return { program, services, represent: representations(services) };
}

test("a declared application keeps its exact arguments and the dependent generic default", () => {
  const { program, represent } = fixture();
  const pair = program.named("Pair", node => program.ast.is.IsClassDeclaration(node));
  const held = program.named("held", node => program.ast.is.IsVariableDeclaration(node));
  const descriptor = program.slot(held);
  assert.equal(descriptor.kind === "declared" && descriptor.declaration === pair && descriptor.typeArguments.length === 2, true,
    "the Host fills Output from its default Input");
  assert.equal(descriptor.typeArguments.map(sourceTypeDescriptorStructure).every(argument =>
    argument.kind === "intrinsic" && argument.intrinsic === "bigint"), true,
    "both arguments are the aliased bigint");
  const carrier = represented(represent.slot(held));
  assert.equal(carrier.typeArguments.length === 2 && carrier.typeArguments.every(argument =>
    targetTypeRefEquals(argument, csharpBigIntegerTargetType())), true, "the .NET application has the same two arguments");
});

test("an argument vector of the wrong length is a .NET arity refusal, not a partial binding", () => {
  const { program, represent } = fixture();
  const pair = program.named("Pair", node => program.ast.is.IsClassDeclaration(node));
  const held = program.named("held", node => program.ast.is.IsVariableDeclaration(node));
  const bigint = { kind: "intrinsic", intrinsic: "bigint" };
  for (const typeArguments of [[], [bigint], [bigint, bigint, bigint]]) {
    assert.equal(represent.type({ kind: "declared", declaration: pair, typeArguments }, held, "storage").code,
      "CSHARP_TYPE_ARGUMENT_ARITY", `${typeArguments.length} arguments`);
  }
});

test("construction instantiations bind by binder declaration and keep each argument's native width", () => {
  const { program, services } = fixture();
  const two = program.named("Two", node => program.ast.is.IsClassDeclaration(node));
  const [first, second] = program.ast.typeParameters(two);
  const construction = program.nodes.find(node => program.ast.is.IsNewExpression(node) &&
    program.ast.text(program.ast.as.AsNewExpression(node).Expression) === "Two");
  const instantiation = program.facts.instantiations.at(construction);
  assert.equal(instantiation?.kind, "construction");
  assert.deepEqual(instantiation.receiver.map(binding => binding.declaration), [first, second],
    "receiver bindings are keyed by the binder declarations in declaration order");
  const represented_ = representInstantiation(instantiation, csharpRepresentationContext(services, construction, "type-argument"));
  assert.equal(targetTypeRefEquals(represented(represented_.receiver[0]), csharpBigIntegerTargetType()), true);
  assert.equal(targetTypeRefEquals(represented(represented_.receiver[1]), csharpSourcePrimitiveTargetType("uint8")), true,
    "the second binder keeps its exact uint8 width");
  const made = program.nodes.find(node => program.ast.is.IsNewExpression(node) &&
    program.ast.text(program.ast.as.AsNewExpression(node).Expression) === "Pair");
  const pair = program.facts.instantiations.at(made);
  assert.equal(pair?.kind === "construction" && pair.receiver.length === 2, true,
    "the default-filled binder is part of the published instantiation");
});
