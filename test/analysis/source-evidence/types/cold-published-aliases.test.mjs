import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { createCsharpSourceUnionDefinitions } from "../../../../dist/analysis/source-evidence/types/resolution/union-definitions.js";
import { createCsharpTypeDefinitionRegistry } from "../../../../dist/analysis/project-types/type-definitions.js";
import { representCsharpSourceType } from "../../../../dist/policy/types/source-type-flow/representation.js";
import { csharpSourceTypeParameter } from "../../../../dist/source/extension/type-parameters.js";
import { getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";

function fixture(mode) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/cold", files: {
    "/cold/index.ts": `type Tree<Value> = Value | readonly Tree<Value>[];
      type Other<Value> = Value | readonly Other<Value>[];
      type Optional = number | readonly Optional[] | undefined;
      declare const numeric: Tree<number>; declare const text: Tree<string>;
      declare const optional: Optional;
      function retain<Value>(generic: Tree<Value>): Tree<Value> { return generic; }`,
  }, compilerOptions: { strict: true } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the entire alias program is Source-valid");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/cold/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const named = label => nodes.find(node => source.ast.text(source.ast.name(node)) === label);
  const tree = named("Tree");
  const other = named("Other");
  const registry = createCsharpTypeDefinitionRegistry();
  const effectiveTypes = { ...source.effectiveTypes, get(node) {
    const actual = source.effectiveTypes.get(node);
    if (node !== tree || mode === undefined) return actual;
    return mode === "missing" ? undefined : mode === "foreign" ? source.effectiveTypes.get(other)
      : { ...actual, type: { ...actual.type, typeArguments: [] } };
  } };
  const definitions = createCsharpSourceUnionDefinitions({ ...source, effectiveTypes, typeDefinitions: registry },
    () => assert.fail("cold published aliases cannot reopen a checked Type"));
  const represent = descriptor => representCsharpSourceType({ target: { id: "csharp", options: {} },
    declaredType(declaration, arguments_, actual) {
      const parameter = csharpSourceTypeParameter(declaration, source.ast);
      return parameter ?? definitions.resolveDescriptor(declaration, arguments_, actual.definition, represent,
        actual.definition !== undefined && sourceTypeDescriptorStructure(actual.definition).kind === "optional");
    },
  }, descriptor);
  const cut = label => {
    const outcome = source.effectiveTypes.get(named(label));
    assert.equal(outcome !== undefined && outcome.kind !== "refused", true, label + ": real occurrence publication");
    const pending = [outcome.type];
    while (pending.length > 0) {
      const descriptor = pending.pop();
      if (descriptor.kind === "declared") {
        if (descriptor.cut === "recursion") return descriptor;
        if (descriptor.definition !== undefined) pending.push(descriptor.definition);
      } else if (descriptor.kind === "array") pending.push(descriptor.element);
      else if (descriptor.kind === "optional") pending.push(descriptor.value);
      else if (descriptor.kind === "union") pending.push(...descriptor.types);
    }
    assert.fail(label + ": the actual published descriptor must retain its recursion cut");
  };
  return { source, named, registry, represent, cut };
}

for (const label of ["numeric", "text", "generic", "optional"]) {
  test(`a cold ${label} recursion cut consumes its complete original published template`, () => {
    const current = fixture();
    const descriptor = current.cut(label);
    const result = current.represent(descriptor);
    const carrier = getCsharpNullableElementTargetType(result) ?? result;
    assert.equal(carrier !== undefined, true, "definition discovery order cannot reject a published cut");
    const arms = current.registry.sourceUnionArms(carrier);
    assert.equal(arms?.some(arm => arm.kind === "array" && targetTypeRefEquals(arm.element, result)), true,
      "the recursive element retains the exact instantiated carrier and absence state");
    if (label === "generic") assert.equal(carrier.typeArguments[0].csharpDeclaration === descriptor.typeArguments[0].declaration, true,
      "open arguments retain the original compiler declaration, not their spelling");
    assert.equal(targetTypeRefEquals(current.represent(descriptor), result), true, "the warm read has the identical contract");
    assert.equal(current.registry.seal().sourceUnions().length, 1, "one canonical open template owns all instantiations");
  });
}

for (const mode of ["missing", "foreign", "incomplete"]) {
  test(`${mode} canonical template cannot authorize a cold recursion cut`, () => {
    const current = fixture(mode);
    assert.equal(current.represent(current.cut("numeric")) === undefined, true,
      "no raw Type, foreign declaration or incomplete binder vector can replace the original publication");
    assert.equal(current.registry.sourceUnions().length, 0, "an unavailable template cannot poison the registry");
  });
}

