import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { projectSourceDeclarationTargetType } from "../../../../dist/analysis/source-evidence/types/resolution/project-types.js";
import { getCsharpDelegateSignature } from "../../../../dist/target-model/types/carriers/delegates.js";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";

const checked = checkCsharpSource({ sourceText: `
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
`, files: { "foreign.d.ts": "export interface Foreign<Value> { (value: Value): Value; }" } });
assertCsharpCheckingSucceeded(checked);
const source = createTargetSourceProgram(checked.source);
const integer = name => ({ kind: "source-primitive", name });

function fixture(name, changed) {
  const declaration = source.navigation.nodes.find(node => source.ast.is.IsInterfaceDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === name);
  const original = source.navigation.declaredHeritage(declaration);
  assert.equal(original.kind === "resolved" && original.edges.length === 1, true, "one actual authored inheritance edge");
  const edge = original.edges[0];
  const arguments_ = new Set(edge.typeArguments);
  let rawReads = 0;
  const lowerings = [];
  const host = {
    ast: source.ast, effectiveTypes: source.effectiveTypes, sourceFacts: source.sourceFacts,
    navigation: { ...source.navigation, declaredHeritage(node) {
      return node === declaration && changed !== undefined ? { ...original, edges: [changed(edge)] }
        : source.navigation.declaredHeritage(node);
    } },
    target: { id: "csharp" }, hasSemantics: source.semantics.includes,
    semanticsFor(node) {
      const queries = source.semantics.forNode(node);
      return { ...queries, types: { ...queries.types, authoredType(selected) {
        if (arguments_.has(selected)) { rawReads += 1; assert.fail("the existing selected heritage vector replaces this raw read"); }
        return queries.types.authoredType(selected);
      } } };
    },
  };
  const scope = { host, resolveNodeWithState(node) {
    lowerings.push(node);
    const defaultParameter = source.ast.parent(node);
    const isDefault = source.ast.is.IsTypeParameterDeclaration(defaultParameter);
    if (isDefault) {
      assert.equal(source.ast.as.AsTypeParameterDeclaration(defaultParameter).DefaultType === node, true,
        "an omitted argument still lowers only its original default syntax");
      return integer(source.ast.text(source.ast.name(defaultParameter)) === "Second" ? "int64" : "int32");
    }
    assert.equal(arguments_.has(node), true, "Native lowering consumes only the identical original explicit argument");
    return integer(name === "Aliased" || name === "Partial" || name === "External" ? "int32" : "int64");
  } };
  return { declaration, edge, lowerings, reads: () => rawReads,
    resolve: () => projectSourceDeclarationTargetType(scope, declaration, []) };
}

for (const [name, width] of [["Concrete", "int64"], ["Aliased", "int32"], ["Selected", "int64"], ["Captured", "int64"]]) {
  test(`published heritage ${name} keeps the exact selected checked argument and Native width`, () => {
    const value = fixture(name);
    const selected = getCsharpDelegateSignature(value.resolve());
    assert.equal(selected?.parameters[0]?.kind === "source-primitive" && selected.parameters[0].name === width, true);
    assert.equal(value.reads() === 0 && value.lowerings.length === 1 && value.lowerings[0] === value.edge.typeArguments[0], true);
  });
}

test("implicit and trailing heritage defaults retain their original Native default fill", () => {
  for (const name of ["Defaulted", "Partial"]) {
    const value = fixture(name);
    assert.equal(value.edge.selectedTypeArguments.length > value.edge.typeArguments.length, true,
      "the checked local vector includes the implicit defaults beyond its explicit prefix");
    const selected = getCsharpDelegateSignature(value.resolve());
    assert.equal(selected?.parameters[0]?.kind === "source-primitive" && selected.parameters[0].name === "int32", true);
    if (name === "Partial") assert.equal(selected.parameters[1]?.kind === "source-primitive" && selected.parameters[1].name === "int64", true);
    assert.equal(value.reads() === 0 && value.lowerings.length === (name === "Partial" ? 2 : 1), true);
  }
});

test("missing, incomplete and oversized checked heritage vectors are unavailable without a raw retry", () => {
  for (const changed of [edge => ({ ...edge, selectedTypeArguments: undefined }),
    edge => ({ ...edge, selectedTypeArguments: [] }),
    edge => ({ ...edge, selectedTypeArguments: [...edge.selectedTypeArguments, ...edge.selectedTypeArguments] })]) {
    const value = fixture("Concrete", changed);
    assert.equal(value.resolve() === undefined && value.reads() === 0 && value.lowerings.length === 0, true);
  }
});

test("a foreign owner, syntax edge or explicit argument cannot borrow another inheritance publication", () => {
  const other = fixture("Aliased");
  for (const changed of [edge => ({ ...edge, sourceDeclaration: other.declaration }),
    edge => ({ ...edge, heritage: other.edge.heritage }),
    edge => ({ ...edge, typeArguments: other.edge.typeArguments })]) {
    const value = fixture("Concrete", changed);
    assert.equal(value.resolve() === undefined && value.reads() === 0 && value.lowerings.length === 0, true);
  }
});

test("a real foreign callable declaration remains outside the project declaration authority", () => {
  const value = fixture("External");
  assert.equal(source.navigation.isProjectDeclaration(value.edge.target.declaration), false);
  assert.equal(value.resolve() === undefined && value.reads() === 0, true);
});
