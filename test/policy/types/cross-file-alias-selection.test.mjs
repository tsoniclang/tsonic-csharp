// Cross-file alias applications (nextgen C-2542, I2, I6). The Host publishes an alias reference as a `declared`
// descriptor naming the alias declaration in its own file, with the application's type arguments in parameter order
// and the substituted definition (the sole substitution, facts.sums.substitute). C# represents that descriptor once:
// no checker switch to the declaration's file, no C# binding environment, no carrier repair.
import assert from "node:assert/strict";
import test from "node:test";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

function fixture(alias = "export type View<Value> = { readonly [Key in keyof Value]: Value[Key] }", use = "View<Box>") {
  const program = hostProgram(`import type { Box, View } from "./records.js"; export function use(value: ${use}): void {}`, {
    files: { "records.ts": `export interface Box { value: bigint; label: string; } ${alias}` },
  });
  const parameter = program.ast.parameters(program.named("use"))[0];
  const records = program.files.find(file => program.ast.getFileName(file).endsWith("/records.ts"));
  const view = program.named("View");
  return { program, parameter, records, view, descriptor: program.slot(parameter), represent: representations(representationServices(program)) };
}

test("a cross-file mapped alias is one Host descriptor with its declaration owner and exact argument", () => {
  const { program, parameter, records, view, descriptor, represent } = fixture();
  assert.equal(descriptor.kind, "declared");
  assert.equal(descriptor.declaration, view, "the alias declaration itself, not a re-selected checker type");
  assert.equal(program.ast.getSourceFile(view), records, "the declaration stays in its own source file");
  assert.equal(descriptor.typeArguments.length, 1);
  assert.equal(descriptor.typeArguments[0].kind === "declared" && descriptor.typeArguments[0].declaration === program.named("Box"), true);
  const definition = descriptor.definition;
  assert.equal(definition?.kind, "shape", "the mapped application is substituted by the Host");
  assert.deepEqual(definition.members.map(member => [member.name, member.readonly === true]), [["value", true], ["label", true]]);
  const first = represented(represent.slot(parameter));
  const second = represented(represent.type(descriptor, parameter, "storage"));
  assert.equal(first.kind === "target-named" && first.csharpGeneratedStructuralStorage === true, true,
    "a mapped object application is a generated native shape");
  assert.equal(targetTypeRefEquals(first, second), true, "one canonical representation per descriptor");
});

test("compositional cross-file alias syntax retains its parameter order", () => {
  const { program, parameter, descriptor, represent } = fixture("export type View<First, Second> = [First, Second]", "View<Box, string>");
  // A tuple alias is transparent, as at baseline: the Host descriptor is the tuple itself, argument i in position i.
  assert.equal(descriptor.kind, "tuple");
  assert.deepEqual(descriptor.elements.map(element => element.type.kind), ["declared", "string"]);
  assert.equal(descriptor.elements[0].type.kind === "declared" && descriptor.elements[0].type.declaration !== undefined, true);
  const carrier = represented(represent.slot(parameter));
  assert.equal(carrier.kind, "tuple");
  assert.deepEqual(carrier.elements.map(element => element.id), ["global::Fixture.Box", "System.String"],
    "one ordered native tuple: argument i fills binder i");
  void program;
});

test("an alias reference without its definition is a Host invariant breach, not a C# re-resolution", () => {
  const { program, parameter, view, represent } = fixture();
  const box = Object.freeze({ kind: "declared", declaration: program.named("Box"), typeArguments: Object.freeze([]) });
  assert.throws(() => represent.type(Object.freeze({ kind: "declared", declaration: view, typeArguments: Object.freeze([box]) }),
    parameter, "storage"), "I4: a supported alias reference always carries its substituted definition");
});

test("an unexpressible alias does not invent a native carrier", () => {
  const { program, parameter, view, represent } = fixture();
  const box = Object.freeze({ kind: "declared", declaration: program.named("Box"), typeArguments: Object.freeze([]) });
  const result = represent.type(Object.freeze({ kind: "declared", declaration: view, typeArguments: Object.freeze([box]),
    cut: "unexpressible" }), parameter, "storage");
  assert.equal(result.kind, "csharp-refused");
  assert.equal(result.code, "CSHARP_DECLARATION_UNEXPRESSIBLE");
});
