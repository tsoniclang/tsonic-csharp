// Component storage over Host facts (nextgen C-2542 §2, R2, I6). The deleted resolution/source-profiles.ts and
// source-storage-projection.ts threaded checker type components and storage subjects through C# to decide callable
// ABIs and storage owners. Now each slot (parameter, callable result, declaration) has its own Host fact
// (values.slot / values.callableReturn / values.type), and the one representation maps it; profile types (Error) are
// mapped by their published .NET identity only.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { createSourceErrorProviderFixture } from "../../fixtures/dotnet-provider/source-error-bindings.mjs";
import {
  csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, getCsharpDelegateSignature, targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";

test("a contextual rest tuple gives the implementation its exact three native input slots", () => {
  const program = hostProgram(`
export const consume: (...values: [number, bigint, string]) => boolean = (...values) => values[0] > 0;
`);
  const at = representations(representationServices(program));
  const implementation = program.nodes.find(node => program.ast.is.IsArrowFunction(node));
  const published = program.type(implementation);
  assert.equal(published.kind === "callable" && published.calls.length === 1, true, "one published call signature");
  const [rest] = published.calls[0].parameters;
  assert.equal(rest.kind === "rest" && rest.type.kind === "tuple" && rest.type.elements.length === 3, true,
    "the Host keeps the original contextual tuple, not an erased array");
  const signature = getCsharpDelegateSignature(represented(at.value(implementation)));
  const expected = [csharpSourcePrimitiveTargetType("float64"), csharpBigIntegerTargetType(), csharpStringTargetType()];
  assert.equal(signature?.parameters.length, 3, "the one rest tuple expands to three positional .NET parameters");
  assert.equal(signature.parameters.every((type, index) => targetTypeRefEquals(type, expected[index])), true,
    "each slot keeps its exact element carrier");
  assert.equal(targetTypeRefEquals(signature.returnType, csharpSourcePrimitiveTargetType("bool")), true);
});

test("Error profile types keep their exact native identity, and an unpublished identity is a refusal", () => {
  const program = hostProgram(`export function fail(error: Error): Error { return error; }`);
  const parameter = program.ast.parameters(program.named("fail"))[0];
  const published = representations(representationServices(program, { providers: createSourceErrorProviderFixture() })).slot(parameter);
  assert.equal(represented(published).id, "System.Exception", "the recognized Error profile is System.Exception");
  for (const kind of ["missing", "rejected"]) {
    const providers = { ...createSourceErrorProviderFixture(), publishNativeIdentities: () => ({ kind }) };
    const refused = representations(representationServices(program, { providers })).slot(parameter);
    assert.equal(refused.kind === "csharp-refused" && refused.code === "CSHARP_DECLARATION_BINDING", true,
      `${kind}: no Error carrier is manufactured`);
  }
});

test("callable parameters, callable results and the enclosing value each have their own Host slot", () => {
  const program = hostProgram(`
import type { int64 } from "@tsonic/core/types.js";
export const make = (seed: int64): ((label: string) => int64) => (label: string) => seed;
`);
  const at = representations(representationServices(program));
  const [outer, inner] = program.nodes.filter(node => program.ast.is.IsArrowFunction(node));
  const seed = program.ast.parameters(outer)[0];
  const label = program.ast.parameters(inner)[0];
  assert.equal(targetTypeRefEquals(represented(at.slot(seed)), csharpSourcePrimitiveTargetType("int64")), true,
    "the outer parameter is its own entry input");
  assert.equal(targetTypeRefEquals(represented(at.slot(label)), csharpStringTargetType()), true,
    "the inner parameter is not the enclosing delegate's input");
  const result = getCsharpDelegateSignature(represented(at.callableReturn(outer)));
  assert.equal(result !== undefined && targetTypeRefEquals(result.returnType, csharpSourcePrimitiveTargetType("int64")), true,
    "the outer result is its own delegate, closed over int64");
  const enclosing = getCsharpDelegateSignature(represented(at.value(outer)));
  assert.equal(enclosing?.parameters.length === 1 && targetTypeRefEquals(enclosing.parameters[0], csharpSourcePrimitiveTargetType("int64")), true,
    "the enclosing value keeps its own input, unchanged by the result's");
});

test("a declaration-free transformation keeps the current component's carrier", () => {
  const program = hostProgram(`
import type { int64 } from "@tsonic/core/types.js";
export function first(values: readonly [int64, string]): int64 { const [head] = values; return head; }
`);
  const at = representations(representationServices(program));
  const head = program.nodes.find(node => program.ast.is.IsBindingElement(node) && program.ast.text(program.ast.name(node)) === "head");
  assert.notEqual(head, undefined, "the binding element exists");
  assert.equal(targetTypeRefEquals(represented(at.slot(head)), csharpSourcePrimitiveTargetType("int64")), true,
    "the tuple element component keeps its exact native width");
});
