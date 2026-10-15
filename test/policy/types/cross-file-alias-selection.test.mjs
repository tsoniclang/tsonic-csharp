import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { resolveCompositionalSourceTypeAlias } from "../../../dist/policy/types/resolution/source-references.js";

function fixture(alias = "export type View<Value> = { readonly [Key in keyof Value]: Value[Key] }", use = "View<Box>") {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    compilerOptions: { strict: true, module: "esnext", moduleResolution: "bundler" }, files: {
      "/project/records.ts": `export interface Box { value: bigint; label: string; } ${alias}`,
      "/project/index.ts": `import type { Box, View } from './records.js'; export function use(value: ${use}): void {}`,
    },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the original cross-file source is valid");
  const source = createTargetSourceProgram(checked);
  const file = source.navigation.sourceFiles.find(candidate => source.ast.getFileName(candidate) === "/project/index.ts");
  let parameter;
  const visit = node => {
    if (source.ast.is.IsParameterDeclaration(node)) parameter = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const node = source.ast.typeNode(parameter);
  const typeName = source.ast.as.AsTypeReferenceNode(node).TypeName;
  const reference = source.navigation.sourceReferenceFor(typeName);
  const parameters = source.ast.typeParameters(reference.declaration);
  const queries = source.semantics.forFile(file);
  const selectedType = queries.types.authoredType(node);
  const sourceArguments = source.ast.typeArguments(node).map(argument => queries.types.authoredType(argument));
  const targets = sourceArguments.map((argument, index) => ({ kind: "target-named", id: `Native.Argument${index}`, name: `Argument${index}` }));
  return { source, file, node, typeName, reference, parameters, queries, selectedType, sourceArguments, targets };
}

test("cross-file transformed aliases retain the selected checker and exact generic bindings", () => {
  const selected = fixture();
  const resultType = { kind: "source-primitive", name: "int64" };
  const inherited = {};
  const inheritedBinding = { sourceType: {}, targetType: { kind: "source-primitive", name: "uint64" } };
  const state = { depth: 4, sourceBindings: new Map([[inherited, inheritedBinding]]) };
  let selections = 0;
  const result = resolveCompositionalSourceTypeAlias({ host: {
    ast: selected.source.ast, navigation: selected.source.navigation,
    semantics: () => { assert.fail("selected types must not switch to their declaration checker"); },
  }, resolveCheckerTransformedSourceType: (root, type, queries, bound) => {
    selections += 1;
    assert.equal(root === selected.source.ast.typeNode(selected.reference.declaration), true, "original authored alias root");
    assert.equal(type === selected.selectedType && queries === selected.queries, true, "one exact caller checker");
    assert.equal(bound.depth, 5, "bounded recursion remains selected");
    assert.equal(bound.sourceBindings.get(inherited) === inheritedBinding, true, "outer bindings remain intact");
    assert.equal(bound.sourceBindings.get(selected.parameters[0]).sourceType === selected.sourceArguments[0], true, "exact checked generic argument");
    assert.equal(bound.sourceBindings.get(selected.parameters[0]).targetType === selected.targets[0], true, "matching native carrier");
    return resultType;
  }, resolveNodeWithState: () => assert.fail("a checked mapped result is not declaration-only syntax") },
  selected.typeName, selected.targets, selected.selectedType, selected.queries, state, selected.sourceArguments);
  assert.equal(result.kind === "resolved" && result.type === resultType, true, "retain the native result without carrier repair");
  assert.equal(selections, 1, "single canonical alias selection");
  assert.equal(state.sourceBindings.size, 1, "caller bindings are never mutated");
});

test("compositional cross-file alias syntax retains its declaration owner and parameter order", () => {
  const selected = fixture("export type View<First, Second> = [First, Second]", "View<Box, string>");
  const carrier = { kind: "tuple", elements: selected.targets };
  const result = resolveCompositionalSourceTypeAlias({ host: {
    ast: selected.source.ast, navigation: selected.source.navigation,
  }, resolveCheckerTransformedSourceType: () => assert.fail("tuple syntax already has its exact owner"),
  resolveNodeWithState: (root, file, state) => {
    assert.equal(root === selected.source.ast.typeNode(selected.reference.declaration), true, "authored tuple root");
    assert.equal(file === selected.reference.sourceFile, true, "syntax stays with its declaration source file");
    for (const [index, parameter] of selected.parameters.entries()) {
      assert.equal(state.sourceBindings.get(parameter).sourceType === selected.sourceArguments[index], true, `checked argument ${index}`);
      assert.equal(state.sourceBindings.get(parameter).targetType === selected.targets[index], true, `native argument ${index}`);
    }
    return carrier;
  } }, selected.typeName, selected.targets, selected.selectedType, selected.queries, { depth: 0 }, selected.sourceArguments);
  assert.equal(result.kind === "resolved" && result.type === carrier, true, "one ordered native tuple representation");
});

test("alias selection rejects incomplete arguments and duplicate declaration identities before resolution", () => {
  const selected = fixture();
  const host = { ast: selected.source.ast, navigation: selected.source.navigation };
  const scope = { host, resolveCheckerTransformedSourceType: () => assert.fail("malformed binders cannot select a native result"),
    resolveNodeWithState: () => assert.fail("malformed binders cannot resolve declaration syntax") };
  for (const [targets, arguments_] of [[[], []], [selected.targets, [undefined]], [selected.targets, []]]) {
    assert.equal(resolveCompositionalSourceTypeAlias(scope, selected.typeName, targets, selected.selectedType,
      selected.queries, { depth: 0 }, arguments_).kind, "rejected", "arity and absence remain fail-closed");
  }
  const duplicate = { ...scope, host: { ...host, ast: { ...host.ast,
    typeParameters: () => [selected.parameters[0], selected.parameters[0]],
  } } };
  assert.equal(resolveCompositionalSourceTypeAlias(duplicate, selected.typeName, [...selected.targets, ...selected.targets],
    selected.selectedType, selected.queries, { depth: 0 }, [...selected.sourceArguments, ...selected.sourceArguments]).kind,
  "rejected", "same-spelled syntax cannot invent a second declaration quantifier");
});

test("unresolved transformed evidence does not invent a selected native carrier", () => {
  const selected = fixture();
  const result = resolveCompositionalSourceTypeAlias({ host: { ast: selected.source.ast, navigation: selected.source.navigation },
    resolveCheckerTransformedSourceType: () => undefined,
  }, selected.typeName, selected.targets, selected.selectedType, selected.queries, { depth: 0 }, selected.sourceArguments);
  assert.equal(result.kind, "checker-transformed-alias", "unavailable exact evidence remains unavailable");
});
