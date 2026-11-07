// Recursive published aliases (ported from the c2529 after-image to the nextgen facts, C-2542). The Host publishes
// each alias application with its definition and a `cut: "recursion"` at the self reference. C# represents the
// application as one named runtime union (`__TsonicUnion_<hash>`) registered with its positional arms (AGENT-C1-NOTES
// D4). The result does not depend on which application is represented first. A recursion cut outside its own definition,
// or an alias without definition or cut, is a Host invariant breach (I4): it throws and never reaches the registry.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { createCsharpTypeDefinitionRegistry } from "../../../../dist/analysis/project-types/type-definitions.js";
import { getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";

const sourceText = `type Tree<Value> = Value | readonly Tree<Value>[];
  type Other<Value> = Value | readonly Other<Value>[];
  type Optional = number | readonly Optional[] | undefined;
  declare const numeric: Tree<number>; declare const text: Tree<string>;
  declare const optional: Optional;
  function retain<Value>(generic: Tree<Value>): Tree<Value> { return generic; }`;

function fixture() {
  const program = hostProgram(sourceText);
  const registry = createCsharpTypeDefinitionRegistry();
  const services = representationServices(program, { typeDefinitions: registry });
  const represent = representations(services);
  const occurrence = label => program.named(label, node => program.ast.is.IsVariableDeclaration(node) || program.ast.is.IsParameterDeclaration(node));
  const published = label => program.type(occurrence(label));
  const cut = label => {
    const pending = [published(label)];
    while (pending.length > 0) {
      const descriptor = pending.pop();
      if (descriptor.kind === "declared") {
        if (descriptor.cut === "recursion") return descriptor;
        if (descriptor.definition !== undefined) pending.push(descriptor.definition);
      } else if (descriptor.kind === "array") pending.push(descriptor.element);
      else if (descriptor.kind === "optional") pending.push(descriptor.value);
      else if (descriptor.kind === "union") pending.push(...descriptor.types);
    }
    assert.fail(label + ": the published descriptor must retain its recursion cut");
  };
  return { program, registry, represent, occurrence, published, cut };
}

for (const label of ["numeric", "text", "generic", "optional"]) {
  test(`a ${label} recursive alias application, represented first in a fresh program view, is one named runtime union`, () => {
    const current = fixture();
    assert.equal(current.cut(label).cut, "recursion", "the Host publishes the self reference as a recursion cut");
    const site = current.occurrence(label);
    const result = represented(current.represent.type(current.published(label), site, "storage"));
    const carrier = getCsharpNullableElementTargetType(result) ?? result;
    assert.equal(label === "optional", getCsharpNullableElementTargetType(result) !== undefined,
      "the absence arm of the alias lifts the named union to Nullable (A11)");
    const arms = current.registry.sourceUnionArms(carrier);
    assert.equal(arms?.some(arm => arm.kind === "array" && targetTypeRefEquals(arm.element, result)), true,
      "the recursive element is the instantiated carrier with its absence state, positional among the Host arms");
    if (label === "generic") assert.equal(carrier.typeArguments[0].kind, "type-parameter",
      "an open argument stays the alias binder, not its spelling");
    assert.equal(targetTypeRefEquals(represented(current.represent.type(current.published(label), site, "storage")), result), true,
      "a second read has the identical contract");
    assert.equal(current.registry.sourceUnions().length, 1, "one open template owns every application of the alias");
  });
}

test("a recursion cut outside its own definition, or an alias without definition or cut, is an invariant failure", () => {
  const current = fixture();
  const site = current.occurrence("numeric");
  assert.throws(() => current.represent.type(current.cut("numeric"), site, "storage"), /recursion cut must occur inside/u,
    "a cold cut never looks up or rebuilds a template on its own");
  const published = current.published("numeric");
  const { definition: _definition, ...incomplete } = published;
  assert.throws(() => current.represent.type(Object.freeze(incomplete), site, "storage"), /must carry its definition/u,
    "an incomplete Host publication cannot authorize a carrier");
  assert.equal(current.registry.sourceUnions().length, 0, "an unavailable template does not poison the registry");
});
