// Published heritage arguments (nextgen C-2542). The Host publishes each inheritance edge with its complete argument
// vector as descriptors (facts.objects.heritage: explicit arguments, aliases resolved, defaults filled, outer binders
// kept). C# reads no heritage syntax and lowers no default itself; a project interface that only declares a call
// signature is represented as that delegate with the published widths (representation/declared.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { getCsharpDelegateSignature } from "../../../../dist/target-model/types/carriers/delegates.js";

const program = hostProgram(`
  import type { Foreign } from "./foreign.js";
  interface Unary<Value = int32> { (value: Value): Value; }
  interface Concrete extends Unary<int64> {}
  interface Defaulted extends Unary {}
  type Width = int32;
  interface Aliased extends Unary<Width> {}
  namespace Shadow { export type Width = int64; export interface Selected extends Unary<Width> {} }
  interface External extends Foreign<int32> {}
  interface Pair<First = int32, Second = int64> { (left: First, right: Second): Second; }
  interface Partial extends Pair<int32> {}
  export function outer<Outer>(): void { interface Captured extends Unary<Outer> {} }
  declare const concrete: Concrete; declare const aliased: Aliased; declare const selected: Shadow.Selected;
  declare const defaulted: Defaulted; declare const partial: Partial;
`, { files: { "foreign.d.ts": "export interface Foreign<Value> { (value: Value): Value; }" } });
const represent = representations(representationServices(program));
const interfaceNamed = name => program.named(name, node => program.ast.is.IsInterfaceDeclaration(node));
const width = descriptor => {
  const structure = sourceTypeDescriptorStructure(descriptor);
  return structure.kind === "primitive" ? structure.primitive : structure.kind === "declared" ? "binder" : structure.kind;
};

function edge(name) {
  const edges = program.facts.objects.heritage(interfaceNamed(name));
  assert.equal(Array.isArray(edges) && edges.length === 1, true, `${name}: one authored inheritance edge`);
  return edges[0];
}

for (const [name, expected] of [["Concrete", ["int64"]], ["Aliased", ["int32"]], ["Selected", ["int64"]], ["Captured", ["binder"]],
  ["Defaulted", ["int32"]], ["Partial", ["int32", "int64"]]]) {
  test(`published heritage ${name} carries its complete argument vector`, () => {
    const selected = edge(name);
    assert.equal(selected.kind, "extends");
    assert.deepEqual(selected.typeArguments.map(width), expected,
      "explicit, aliased, shadowed, outer-binder and default arguments are Host facts");
    if (name === "Captured") {
      const outer = program.ast.typeParameters(program.named("outer", node => program.ast.is.IsFunctionDeclaration(node)))[0];
      assert.equal(sourceTypeDescriptorStructure(selected.typeArguments[0]).declaration === outer, true,
        "the outer binder is its declaration, not its spelling");
    }
  });
}

for (const [name, widths] of [["concrete", ["int64"]], ["aliased", ["int32"]], ["selected", ["int64"]], ["defaulted", ["int32"]],
  ["partial", ["int32", "int64"]]]) {
  test(`a call-only project interface (${name}) is the delegate with the published widths`, () => {
    const variable = program.named(name, node => program.ast.is.IsVariableDeclaration(node));
    const signature = getCsharpDelegateSignature(represented(represent.slot(variable)));
    assert.deepEqual(signature?.parameters.map(parameter => parameter.kind === "source-primitive" ? parameter.name : parameter.kind), widths);
  });
}

test("a foreign callable declaration stays outside the project declarations", () => {
  const target = edge("External").target;
  assert.equal(program.facts.navigation.identity.isProjectDeclaration(target), false,
    "the declaration-file interface is not a project type");
});
