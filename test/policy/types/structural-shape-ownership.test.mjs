import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { typeHasProjectOwnedShapeDeclaration } from "../../../dist/policy/types/objects/object-shape-policy/source-evidence.js";

function fixture() {
  const type = {};
  const aliasSymbol = {};
  const propertySymbol = {};
  const rootSymbol = {};
  const aliasDeclaration = {};
  const projectField = {};
  const foreignField = {};
  const selectedNode = {};
  const identity = {};
  const declarations = new Map([
    [aliasSymbol, [aliasDeclaration]],
    [propertySymbol, [projectField]],
    [rootSymbol, [foreignField]],
  ]);
  const projectDeclarations = new Set([aliasDeclaration, projectField, selectedNode]);
  const facts = new Map();
  const property = { symbol: propertySymbol, rootSymbols: [rootSymbol] };
  const properties = [property];
  const relation = { kind: "member" };
  const selection = { kind: "resolved", relations: [relation] };
  const queries = {
    declarations: {
      typeAliasSymbol: () => aliasSymbol,
      typeSymbol: () => undefined,
      symbolDeclarations: symbol => declarations.get(symbol) ?? [],
    },
    types: { propertyInfos: () => properties, standardTransformation: () => undefined },
  };
  const host = {
    ast: { is: { IsObjectLiteralExpression: node => node === selectedNode, IsTypeLiteralNode: () => false } },
    navigation: {
      isProjectDeclaration: node => projectDeclarations.has(node),
      declarationFor: node => node === selectedNode ? aliasDeclaration : undefined,
    },
    sourceFacts: { getFact: (subject, key) => key === providerVirtualDeclarationFactKey ? facts.get(subject) : undefined },
    providers: { resolveMember: selected => {
      assert.equal(selected === identity, true, "the exact foreign declaration fact is queried");
      return selection;
    } },
  };
  return { type, selectedNode, aliasSymbol, propertySymbol, rootSymbol, aliasDeclaration,
    projectField, foreignField, identity, declarations, projectDeclarations, facts, properties,
    property, relation, selection, queries, host };
}

function owns(value, node) {
  return typeHasProjectOwnedShapeDeclaration(value.type, node, value.queries, value.host);
}

test("project alias and literal syntax cannot grant ownership to foreign root declarations", () => {
  const value = fixture();
  assert.equal(owns(value), false, "project alias does not own inherited foreign fields");
  assert.equal(owns(value, value.selectedNode), false, "project expression does not erase foreign member provenance");
  value.property.rootSymbols = [];
  value.declarations.set(value.propertySymbol, [value.foreignField]);
  assert.equal(owns(value), false, "direct foreign declarations obey the same rule");
});

test("exact project roots and newly declared mapped keys remain project-owned", () => {
  const value = fixture();
  value.projectDeclarations.add(value.foreignField);
  assert.equal(owns(value), true, "all exact member roots are project source");
  value.declarations.set(value.propertySymbol, []);
  value.property.rootSymbols = [];
  assert.equal(owns(value), true, "a fresh finite mapped key retains its project alias owner");
  value.projectDeclarations.delete(value.aliasDeclaration);
  assert.equal(owns(value), false, "fresh keys cannot invent an absent project owner");
});

test("project structural transformations own fresh keys but never inherited foreign members", () => {
  const value = fixture();
  value.queries.types.standardTransformation = () => ({ kind: "structural" });
  assert.equal(owns(value, value.selectedNode), false, "structural utilities cannot bypass actual foreign roots");
  value.property.rootSymbols = [];
  value.declarations.set(value.propertySymbol, []);
  value.projectDeclarations.delete(value.aliasDeclaration);
  assert.equal(owns(value, value.selectedNode), true, "exact authored structural syntax owns fresh finite keys");
  value.queries.types.standardTransformation = () => ({ kind: "unresolved" });
  assert.equal(owns(value), false, "unresolved transformations cannot manufacture ownership");
});

test("foreign roots require actual represented native provider members", () => {
  const value = fixture();
  value.facts.set(value.foreignField, value.identity);
  assert.equal(owns(value), true, "exact native provider relation owns a foreign member");
  value.declarations.set(value.propertySymbol, []);
  assert.equal(owns(value), true, "root symbols retain their exact declaration relation");
  value.projectDeclarations.delete(value.aliasDeclaration);
  assert.equal(owns(value), true, "represented native members do not require a fabricated local alias");
});

test("provider names or facts alone cannot authorize unrepresented or ambiguous foreign fields", () => {
  const controls = [
    { kind: "missing" },
    { kind: "rejected" },
    { kind: "resolved", relations: [] },
    { kind: "resolved", relations: [{ kind: "type" }] },
    { kind: "resolved", relations: [{ kind: "member" }, { kind: "member" }] },
  ];
  for (const [index, selection] of controls.entries()) {
    const value = fixture();
    value.facts.set(value.foreignField, value.identity);
    value.host.providers.resolveMember = () => selection;
    assert.equal(owns(value), false, `native relation control ${index}`);
  }
  const value = fixture();
  value.facts.set(value.foreignField, value.identity);
  value.declarations.set(value.rootSymbol, [value.foreignField, undefined]);
  assert.equal(owns(value), false, "missing declaration evidence remains fail-closed");
});

test("direct provider types cannot be reconstructed as project structural objects", () => {
  const value = fixture();
  value.projectDeclarations.add(value.foreignField);
  value.facts.set(value.type, value.identity);
  assert.equal(owns(value), false, "native provider construction remains its existing exact owner");
});
