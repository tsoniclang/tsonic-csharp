import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { bindCsharpSourceDeclarationArguments, bindCsharpSourceTypeArguments } from "../../../../dist/analysis/source-evidence/types/resolution/generic-arguments.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "class Pair<Input, Output = Input> {} type Actual = bigint;",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const program = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const declaration = program.ast.statements(file).find(node => program.ast.is.IsClassDeclaration(node));
  const [input, output] = program.ast.typeParameters(declaration);
  const queries = program.semantics.forFile(file);
  const inputNode = program.ast.as.AsTypeParameterDeclaration(output).DefaultType;
  const sourceType = queries.types.authoredType(program.ast.typeNode(program.ast.statements(file)
    .find(node => program.ast.is.IsTypeAliasDeclaration(node))));
  const carrier = csharpSourcePrimitiveTargetType("int64");
  const scope = { host: { ast: { ...program.ast }, effectiveTypes: program.effectiveTypes,
    semanticsFor: () => queries },
    resolveNodeWithState: (node, file, state) => node === inputNode && file === queries.sourceFile
      ? state.sourceBindings?.get(input)?.targetType : undefined };
  return { declaration, input, output, scope, sourceType, carrier, queries };
}

test("named source application retains exact arguments and dependent generic defaults", () => {
  const { declaration, input, output, scope, sourceType, carrier, queries } = fixture();
  const original = { depth: 0, sourceBindings: new Map() };
  const selected = bindCsharpSourceDeclarationArguments(scope, declaration, [carrier], [sourceType], original, queries);
  assert.deepEqual(selected?.sourceBindings.get(input), { sourceType, targetType: carrier });
  assert.deepEqual(selected?.sourceBindings.get(output), { sourceType, targetType: carrier });
  assert.notEqual(selected.sourceBindings, original.sourceBindings);
  assert.equal(original.sourceBindings.size, 0);
});

test("named source application rejects missing, duplicate, inconsistent and excessive arguments", () => {
  const { declaration, input, scope, sourceType, carrier, queries } = fixture();
  const state = { depth: 0 };
  for (const [arguments_, sources] of [[[], []], [[carrier], undefined], [[carrier], []],
    [[carrier], [undefined]], [[carrier, carrier, carrier], [sourceType, sourceType, sourceType]]]) {
    assert.equal(bindCsharpSourceDeclarationArguments(scope, declaration, arguments_, sources, state, queries), undefined);
  }
  scope.host.ast.typeParameters = () => [input, input];
  assert.equal(bindCsharpSourceDeclarationArguments(scope, declaration, [carrier, carrier], [sourceType, sourceType], state, queries), undefined);
});

test("checked receiver arguments bind exact declaration identities without replacing outer state", () => {
  const receiver = {};
  const outer = {};
  const first = {};
  const second = {};
  const firstType = {};
  const secondType = {};
  const file = {};
  const integer = csharpSourcePrimitiveTargetType("int64");
  const byte = csharpSourcePrimitiveTargetType("uint8");
  const original = { depth: 4, sourceBindings: new Map([[outer, { sourceType: firstType, targetType: integer }]]) };
  const selections = [];
  const queries = { sourceFile: file, types: { typeArgumentBindings: type => type === receiver
    ? [{ declaration: second, argumentType: secondType }, { declaration: first, argumentType: firstType }] : undefined } };
  const scope = { resolveTypeWithState(type, sourceFile, state) {
    selections.push({ type, sourceFile, depth: state.depth });
    assert.equal(state.sourceBindings === original.sourceBindings, true, "resolution uses the unchanged outer environment");
    return type === firstType ? integer : type === secondType ? byte : undefined;
  } };
  const selected = bindCsharpSourceTypeArguments(scope, receiver, queries, original);
  assert.equal(selected.sourceBindings.get(first).sourceType === firstType &&
    selected.sourceBindings.get(first).targetType === integer, true, "checked first declaration, not native argument position");
  assert.equal(selected.sourceBindings.get(second).sourceType === secondType &&
    selected.sourceBindings.get(second).targetType === byte, true, "checked second declaration retains its exact width");
  assert.equal(selected.sourceBindings.get(outer) === original.sourceBindings.get(outer), true, "unrelated bindings survive");
  assert.equal(selected.sourceBindings !== original.sourceBindings && original.sourceBindings.size === 1, true, "no mutation");
  assert.equal(selections.every(selection => selection.sourceFile === file && selection.depth === 5), true, "checked query context and bounded depth");
  assert.equal(bindCsharpSourceTypeArguments(scope, {}, queries, original) === original, true, "non-generic receiver is unchanged");
});

test("receiver argument binding rejects unresolved carriers and duplicate declaration evidence atomically", () => {
  const declaration = {};
  const type = {};
  const state = { depth: 0, sourceBindings: new Map() };
  for (const bindings of [
    [{ declaration, argumentType: type }],
    [{ declaration, argumentType: type }, { declaration, argumentType: type }],
  ]) {
    const queries = { sourceFile: {}, types: { typeArgumentBindings: () => bindings } };
    assert.equal(bindCsharpSourceTypeArguments({ resolveTypeWithState: () => undefined }, type, queries, state),
      undefined, "incomplete or contradictory receiver evidence cannot publish a partial environment");
    assert.equal(state.sourceBindings.size, 0, "rejected selection preserves the caller");
  }
});
