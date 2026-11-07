// Storage owners over Host facts (nextgen C-2542 §2, R2, R5, I4). The deleted resolution/{calls,public-api,
// source-references,declarations}.ts selected the storage declaration of a read from checker property/element access
// info and retried checked types when a publication was missing. Now the Host publishes the selected member
// (selections.memberAccess / values.elementAccess), its project role, and the slot type; C# represents the slot.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpSourcePrimitiveTargetType, csharpTsValueTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { selectCsharpClassFactoryType } from "../../../dist/analysis/project-types/class-factory-types.js";
import { getCsharpClassFactory } from "../../../dist/target-model/types/carriers/class-factories.js";

const storageSource = `
import type { int32 } from "@tsonic/core/types.js";
import { Container } from "./container.js";
declare const container: Container;
export function property(): int32 { return container.value; }
export function element(): int32 { return container["value"]; }
export function size(text: string): number { return text.length; }
export function passthrough(value: unknown): unknown { return value; }
`;
const containerSource = `
import type { int32 } from "@tsonic/core/types.js";
export class Container { value: int32 = 0 as int32; }
`;

function fixture() {
  const program = hostProgram(storageSource, { files: { "container.ts": containerSource } });
  const at = representations(representationServices(program));
  const find = predicate => {
    const found = program.nodes.find(predicate);
    assert.notEqual(found, undefined);
    return found;
  };
  return { program, at, find };
}

test("a property read selects its project member declaration in the declaring file", () => {
  const { program, at, find } = fixture();
  const access = find(node => program.ast.is.IsPropertyAccessExpression(node) && program.ast.text(node) === "container.value");
  const selected = program.facts.selections.memberAccess(access);
  assert.equal(selected?.selected.kind === "member" && selected.selected.declarations.length === 1, true);
  const [declaration] = selected.selected.declarations;
  assert.equal(program.facts.navigation.identity.isProjectDeclaration(declaration), true, "a project member owns its storage");
  assert.equal(program.ast.getPath(program.ast.getSourceFile(declaration)).endsWith("/container.ts"), true,
    "the storage declaration's own file, not the reference's");
  const int32 = csharpSourcePrimitiveTargetType("int32");
  assert.equal(targetTypeRefEquals(represented(at.slot(declaration)), int32), true, "the member slot is the storage carrier");
  assert.equal(targetTypeRefEquals(represented(at.value(access)), int32), true, "the read value is the same Host answer");
});

test("an element read with a literal key selects the same member", () => {
  const { program, find } = fixture();
  const access = find(node => program.ast.is.IsElementAccessExpression(node));
  const record = program.facts.values.elementAccess(access);
  assert.equal(record.selected.kind === "member" && record.selected.name === "value", true);
  const property = program.facts.selections.memberAccess(
    find(node => program.ast.is.IsPropertyAccessExpression(node) && program.ast.text(node) === "container.value"));
  assert.equal(property.selected.declarations.includes(record.selected.declaration), true,
    "property and element reads of one member share one storage declaration");
});

test("external library members are not project storage", () => {
  const { program, find } = fixture();
  const access = find(node => program.ast.is.IsPropertyAccessExpression(node) && program.ast.text(node) === "text.length");
  const selected = program.facts.selections.memberAccess(access);
  assert.equal(selected?.selected.kind === "member", true);
  assert.equal(selected.selected.declarations.every(declaration =>
    !program.facts.navigation.identity.isProjectDeclaration(declaration)), true, "String.length belongs to the library");
});

test("a parameter has one published slot; a read of it is its own published value", () => {
  const { program, at, find } = fixture();
  const parameter = program.ast.parameters(program.named("passthrough"))[0];
  const outcome = program.facts.values.slot(parameter);
  assert.equal(outcome.kind === "slot" && outcome.slot === parameter && outcome.authority === "declared", true,
    "the declared parameter slot is the one publication owner");
  assert.equal(targetTypeRefEquals(represented(at.slot(parameter)), csharpTsValueTargetType()), true);
  const read = find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === "value" &&
    program.ast.is.IsReturnStatement(program.ast.parent(node)));
  assert.equal(targetTypeRefEquals(represented(at.value(read)), csharpTsValueTargetType()), true);
});

test("local class factories derive their metadata only from the published instance and original class members", () => {
  const program = hostProgram("function outer() { class Local { Create: unknown; _Create: unknown; IsInstance: unknown; } return Local; } void outer();");
  const owner = program.named("Local");
  const publication = program.facts.values.type(owner);
  assert.equal(publication.kind !== "refused" && publication.type.kind === "declared", true);
  const instance = Object.freeze({ kind: "target-named", id: "fixture.Local", typeArguments: Object.freeze([]) });
  const definition = { kind: "class", declaration: owner, local: true, abstract: false, factoryName: "LocalFactory",
    outerTypeParameters: [], outerTypeProjections: [] };
  const catalog = { definitionForTarget(type) { return type === instance ? definition : undefined; } };
  const factory = selectCsharpClassFactoryType(program.ast, catalog, instance);
  const contract = getCsharpClassFactory(factory);
  assert.equal(contract?.declaration === owner && contract.instance === instance, true);
  assert.equal(contract.createMethodName, "__Create");
  assert.equal(contract.instanceTestMethodName, "_IsInstance");
  assert.equal(selectCsharpClassFactoryType(program.ast, catalog, undefined), undefined);
  assert.equal(selectCsharpClassFactoryType(program.ast, catalog, { ...instance }), undefined);
  definition.abstract = true;
  assert.equal(selectCsharpClassFactoryType(program.ast, catalog, instance), undefined);
});
