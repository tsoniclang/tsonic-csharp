// Class declaration shapes (nextgen C-2542, I2, I6). A project class shape is the instance: the C# project-type
// catalog names the generic .NET type with the declaration's own binders (captured outer binders first), and the
// members are the Host object facts of the declaration's own reference (facts.objects.members), represented once.
// A constructor value (the class's static side, or a variable holding a function) never becomes an instance shape,
// and a missing Host member fact never falls back to another route.
import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpProjectTypeCatalog } from "../../../dist/analysis/project-types/catalog.js";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { hostProgram, representationServices } from "../../representation/host-fixture.mjs";

function fixture(overrides = {}) {
  const program = hostProgram("import { make as imported } from './factory.js'; export class Root<Own> { label: string = ''; }; export const alias = imported;", {
    files: { "factory.ts": "export function make<Outer>() { return class Box<Inner> { label: string = ''; }; }" },
  });
  const catalog = createCsharpProjectTypeCatalog({ ast: program.ast, facts: program.facts, sourceFiles: program.files,
    sourceFacts: program.host.sourceFacts });
  assert.equal(catalog.issues.length, 0, "closed project catalog");
  assert.equal(catalog.definitions.length, 2, "both class declaration forms are exercised");
  const projectTypeCatalog = overrides.catalog?.(catalog) ?? catalog;
  let policy;
  const services = representationServices(program, {
    projectTypes: projectTypeCatalog,
    shapes: Object.freeze({ retainShape: shape => policy.retainShape(shape), resolveCallableValue: (signature, binders) =>
      policy.resolveCallableValue(signature, binders) }),
    ...(overrides.facts === undefined ? {} : { facts: overrides.facts(program.facts) }),
  });
  const sourceStorage = new Proxy({}, { get: (_target, key) => () => assert.fail(`class field shapes do not read storage (${String(key)})`) });
  policy = createCsharpObjectShapePolicy({ ast: program.ast, sourceStorage, projectTypeCatalog,
    typeParameterConstraints: services.typeParameters, representation: () => services });
  return { program, catalog, policy, services };
}

const binderNames = (program, definition) =>
  [...definition.outerTypeParameters, ...definition.typeParameters].map(binder => program.ast.text(program.ast.name(binder)));

test("class declaration shapes are instances over the declaration's own binders and Host members", () => {
  const { program, catalog, policy } = fixture();
  for (const definition of catalog.definitions) {
    const carrier = catalog.targetTypeForDeclaration(definition.declaration, definition.typeParameterBindings);
    const shape = policy.resolveTarget(carrier);
    assert.notEqual(shape, undefined, `${definition.sourceName}: a project class has an instance shape`);
    assert.equal(targetTypeRefEquals(shape.targetType, carrier), true, `${definition.sourceName}: exact nominal instance carrier`);
    assert.deepEqual(binderNames(program, definition), definition.local ? ["Outer", "Inner"] : ["Own"],
      "captured and construction binders stay separate, outer first");
    assert.deepEqual(shape.targetType.typeArguments.map(argument => argument.identity),
      definition.typeParameterBindings.map(argument => argument.identity), "declaration-owned quantifier order");
    assert.deepEqual(shape.members.map(member => member.sourceName), ["label"], "members are the Host instance members");
    assert.equal(shape.members[0].type.id, "System.String");
    assert.equal(policy.resolveTarget(carrier).targetType === shape.targetType, true, "one canonical nominal shape across queries");
  }
});

test("a constructor alias keeps its Host callable type and never becomes an instance", () => {
  const { program, policy } = fixture();
  const alias = program.named("alias");
  assert.equal(program.type(alias).kind, "callable", "the published value of the alias is the factory function");
  assert.equal(policy.resolveNode(alias), undefined, "a callable value has no instance object shape");
  for (const declaration of [program.named("Root")]) {
    const shape = policy.resolveNode(declaration);
    assert.equal(shape === undefined || shape.members.every(member => member.sourceName !== "label"), true,
      "the class value is its static side, never the instance shape");
  }
});

test("unavailable Host member facts never fall back to another shape route", () => {
  const { catalog, policy, program } = fixture({ facts: facts => Object.freeze({ ...facts,
    objects: Object.freeze({ ...facts.objects, members: () => Object.freeze({ kind: "refused", code: "TSONIC_FIXTURE",
      message: "fixture refusal", site: program.named("Root") }) }),
    values: Object.freeze({ ...facts.values, type: () => assert.fail("a declaration shape is not re-derived from a value type") }),
  }) });
  for (const definition of catalog.definitions) {
    assert.equal(policy.resolveTarget(catalog.targetTypeForDeclaration(definition.declaration, definition.typeParameterBindings)),
      undefined, `${definition.sourceName}: unresolved declaration shape fails closed`);
  }
});

test("foreign declaration shapes are not admitted as project-owned nominal storage", () => {
  const { catalog, policy } = fixture({ catalog: original => Object.freeze({ ...original,
    definitionForTarget: () => undefined, definitionForDeclaration: () => undefined }) });
  for (const definition of catalog.definitions) {
    assert.equal(policy.resolveTarget(catalog.targetTypeForDeclaration(definition.declaration, definition.typeParameterBindings)),
      undefined, "exact project declaration ownership remains mandatory");
  }
});
