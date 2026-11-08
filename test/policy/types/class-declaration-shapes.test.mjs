import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { getCsharpCallableMembers } from "../../../dist/target-model/types/carriers/delegates.js";

function fixture() {
  const compiled = analyzeCsharpSource({
    sourceText: "import { make as imported } from './factory.js'; export class Root<Own> { label: string = ''; } export const alias = imported;",
    files: { "factory.ts": "export function make<Outer>() { return class Box<Inner> { label: string = ''; }; }",
      "foreign.d.ts": "declare class Foreign<Value> { readonly label: string; }" },
  });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "the actual project class/factory program has one Native view");
  const program = compiled.analysis.value;
  const source = compiled.source;
  const catalog = program.analysis.policy.projectTypes.catalog;
  assert.equal(catalog.issues.length, 0);
  assert.equal(catalog.definitions.length, 2, "both original project class forms, not the ambient declaration");
  const registry = program.analysis.typeSystem.objectShapes;
  const completed = definition => [...definition.outerTypeParameters, ...definition.typeParameters].map(node => {
    const original = source.facts.descriptors.typeParameter(node);
    const result = program.representation.parameter(original, node);
    assert.equal(result.kind, "represented", "one actual completed Native binder");
    assert.equal(result.value.csharpDeclaration === node, true);
    return result.value;
  });
  return { compiled, source, program, catalog, registry, completed };
}

test("class declarations retain exact nominal instances and ordered completed outer/local binders", () => {
  const { catalog, registry, completed } = fixture();
  for (const definition of catalog.definitions) {
    const parameters = completed(definition);
    const carrier = catalog.targetTypeForDeclaration(definition.declaration, parameters);
    assert.equal(carrier !== undefined, true, "the actual original Native instance declaration");
    const shape = registry.resolveTarget(carrier);
    assert.equal(shape !== undefined && targetTypeRefEquals(shape.targetType, carrier), true);
    assert.deepEqual(carrier.typeArguments.map(parameter => parameter.identity), parameters.map(parameter => parameter.identity));
    assert.deepEqual(parameters.map(parameter => parameter.name), definition.local ? ["Outer", "Inner"] : ["Own"],
      "captured and original class quantifiers stay separate and ordered");
    assert.equal(parameters.every(parameter => parameter.csharpConstraints.kind === "resolved"), true);
    assert.equal(carrier.csharpClassFactory, undefined, "the instance does not masquerade as a constructor value");
    assert.equal(registry.resolveTarget(carrier) === shape, true, "same canonical Native class header");
    assert.equal(shape.members.some(member => member.sourceName === "label" && member.memberKind === "property"), true);
    assert.equal(shape.sourceType === undefined, true, "no checked Type leaks into the Native instance header");
  }
});

test("ordinary imported constructor-producing aliases remain actual callable values, not class instances", () => {
  const { source, program, catalog } = fixture();
  const file = source.sourceFiles.find(file => source.ast.getFileName(file).endsWith("/index.ts"));
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const declaration = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "alias");
  assert.equal(declaration !== undefined, true, "the exact original alias declaration");
  const original = resolvedSourceValue(source.facts.values.declaredSlot(declaration), "the imported callable alias").type;
  const outcome = program.representation.represent(original, "storage", declaration);
  assert.equal(outcome.kind, "represented");
  assert.equal(getCsharpCallableMembers(outcome.value.carrier)?.length > 0, true);
  for (const definition of catalog.definitions) {
    assert.equal(outcome.value.carrier.id === definition.id, false,
      "callable representation cannot be replaced by an unrelated class instance carrier");
  }
});

test("missing Native instance arguments cannot fall back to a constructor value", () => {
  const { catalog, completed } = fixture();
  for (const definition of catalog.definitions) {
    const parameters = completed(definition);
    assert.equal(parameters.length > 0, true);
    assert.equal(catalog.targetTypeForDeclaration(definition.declaration, []), undefined);
    assert.equal(catalog.targetTypeForDeclaration(definition.declaration, [...parameters, parameters[0]]), undefined);
    assert.equal(catalog.targetTypeForDeclaration(undefined, parameters), undefined);
  }
});

test("ambient foreign class declarations never enter the project-owned nominal catalog", () => {
  const { source, catalog } = fixture();
  const file = source.sourceFiles.find(file => source.ast.getFileName(file).endsWith("/foreign.d.ts"));
  assert.equal(file !== undefined, true);
  const declaration = source.ast.statements(file).find(node => source.ast.is.IsClassDeclaration(node));
  assert.equal(declaration !== undefined, true);
  assert.equal(catalog.definitionForDeclaration(declaration), undefined);
  assert.equal(catalog.targetTypeForDeclaration(declaration, []), undefined,
    "a foreign type-only shape is not project constructor/instance authority");
});
