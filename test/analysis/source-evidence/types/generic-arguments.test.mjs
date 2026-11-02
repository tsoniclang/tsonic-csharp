import assert from "node:assert/strict";
import test from "node:test";
import { bindCsharpSourceDeclarationArguments, bindCsharpSourceTypeArguments } from "../../../../dist/analysis/source-evidence/types/resolution/generic-arguments.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

function fixture() {
  const declaration = {};
  const input = {};
  const output = {};
  const inputNode = {};
  const inputType = {};
  const sourceType = {};
  const carrier = csharpSourcePrimitiveTargetType("int64");
  const symbol = {};
  const queries = { sourceFile: {}, types: { authoredType: node => node === inputNode ? inputType : undefined },
    declarations: { typeSymbol: type => type === inputType ? symbol : undefined,
      symbolDeclarations: selected => selected === symbol ? [input] : [] } };
  const scope = { host: { ast: { typeParameters: selected => selected === declaration ? [input, output] : [],
    as: { AsTypeParameterDeclaration: selected => selected === output ? { DefaultType: inputNode } : {} } },
    semanticsFor: () => queries },
    resolveNodeWithState: (node, file, state) => node === inputNode && file === queries.sourceFile
      ? state.sourceBindings?.get(input)?.targetType : undefined };
  return { declaration, input, output, scope, sourceType, carrier };
}

test("named source application retains exact arguments and dependent generic defaults", () => {
  const { declaration, input, output, scope, sourceType, carrier } = fixture();
  const original = { depth: 0, sourceBindings: new Map() };
  const selected = bindCsharpSourceDeclarationArguments(scope, declaration, [carrier], [sourceType], original);
  assert.deepEqual(selected?.sourceBindings.get(input), { sourceType, targetType: carrier });
  assert.deepEqual(selected?.sourceBindings.get(output), { sourceType, targetType: carrier });
  assert.notEqual(selected.sourceBindings, original.sourceBindings);
  assert.equal(original.sourceBindings.size, 0);
});

test("named source application rejects missing, duplicate, inconsistent and excessive arguments", () => {
  const { declaration, input, scope, sourceType, carrier } = fixture();
  const state = { depth: 0 };
  for (const [arguments_, sources] of [[[], []], [[carrier], undefined], [[carrier], []],
    [[carrier], [undefined]], [[carrier, carrier, carrier], [sourceType, sourceType, sourceType]]]) {
    assert.equal(bindCsharpSourceDeclarationArguments(scope, declaration, arguments_, sources, state), undefined);
  }
  scope.host.ast.typeParameters = () => [input, input];
  assert.equal(bindCsharpSourceDeclarationArguments(scope, declaration, [carrier, carrier], [sourceType, sourceType], state), undefined);
});

test("checked receiver arguments bind exact declaration identities without replacing outer state", () => {
  const receiver = {};
  const outer = {};
  const first = {};
  const second = {};
  const firstType = {};
  const secondType = {};
  const firstParameterType = {};
  const secondParameterType = {};
  const template = {};
  const file = {};
  const integer = csharpSourcePrimitiveTargetType("int64");
  const byte = csharpSourcePrimitiveTargetType("uint8");
  const firstParameter = { kind: "type-parameter", identity: "first", name: "First", csharpDeclaration: first };
  const secondParameter = { kind: "type-parameter", identity: "second", name: "Second", csharpDeclaration: second };
  const carrier = arguments_ => ({ kind: "target-named", id: "Fixture.Receiver", typeArguments: arguments_,
    csharpAllowsRefLikeTypeArguments: [false, false] });
  const actual = carrier([integer, byte]);
  const original = { depth: 4, sourceBindings: new Map([[outer, { sourceType: firstType, targetType: integer }]]) };
  const selections = [];
  const queries = { sourceFile: file, types: { typeArgumentBindings: type => type === receiver
    ? [{ declaration: second, parameterType: secondParameterType, argumentType: secondType },
      { declaration: first, parameterType: firstParameterType, argumentType: firstType }] : undefined,
    typeReferenceTarget: type => type === receiver ? template : undefined } };
  const scope = { resolveTypeWithState(type, sourceFile, state) {
    selections.push({ type, sourceFile, depth: state.depth });
    assert.equal(state.sourceBindings === original.sourceBindings, true, "resolution uses the unchanged outer environment");
    return type === firstParameterType ? firstParameter : type === secondParameterType ? secondParameter
      : type === template ? carrier([firstParameter, secondParameter]) : undefined;
  } };
  const selected = bindCsharpSourceTypeArguments(scope, receiver, actual, queries, original);
  assert.equal(selected.sourceBindings.get(first).sourceType === firstType &&
    selected.sourceBindings.get(first).targetType === integer, true, "checked first declaration, not native argument position");
  assert.equal(selected.sourceBindings.get(second).sourceType === secondType &&
    selected.sourceBindings.get(second).targetType === byte, true, "checked second declaration retains its exact width");
  assert.equal(selected.sourceBindings.get(outer) === original.sourceBindings.get(outer), true, "unrelated bindings survive");
  assert.equal(selected.sourceBindings !== original.sourceBindings && original.sourceBindings.size === 1, true, "no mutation");
  assert.equal(selections.every(selection => selection.sourceFile === file && selection.depth === 5), true, "checked query context and bounded depth");
  assert.equal(selections.every(selection => selection.type !== firstType && selection.type !== secondType), true,
    "checked argument types are provenance, never native carrier authorities");
  assert.equal(bindCsharpSourceTypeArguments(scope, {}, actual, queries, original) === original, true, "non-generic receiver is unchanged");
});

test("receiver argument binding rejects unresolved carriers and duplicate declaration evidence atomically", () => {
  const declaration = {};
  const type = {};
  const state = { depth: 0, sourceBindings: new Map() };
  for (const bindings of [
    [{ declaration, argumentType: type }],
    [{ declaration, argumentType: type }, { declaration, argumentType: type }],
  ]) {
    const queries = { sourceFile: {}, types: { typeArgumentBindings: () => bindings, typeReferenceTarget: () => undefined } };
    assert.equal(bindCsharpSourceTypeArguments({ resolveTypeWithState: () => undefined }, type, undefined, queries, state),
      undefined, "incomplete or contradictory receiver evidence cannot publish a partial environment");
    assert.equal(state.sourceBindings.size, 0, "rejected selection preserves the caller");
  }
});

test("receiver binding preserves distinct native widths behind the same erased checked argument and refuses conflicts", () => {
  const first = {};
  const second = {};
  const erased = {};
  const receiver = {};
  const template = {};
  const parameterTypes = [{}, {}];
  const parameters = [first, second].map((declaration, index) => ({ kind: "type-parameter",
    identity: `native:${index}`, name: `Item${index}`, csharpDeclaration: declaration }));
  const integer = csharpSourcePrimitiveTargetType("int64");
  const byte = csharpSourcePrimitiveTargetType("uint8");
  const carrier = arguments_ => ({ kind: "target-named", id: "Fixture.Pair", typeArguments: arguments_,
    csharpAllowsRefLikeTypeArguments: [false, false] });
  const actual = carrier([integer, byte]);
  const queries = { sourceFile: {}, types: {
    typeArgumentBindings: () => [first, second].map((declaration, index) => ({ declaration,
      parameterType: parameterTypes[index], argumentType: erased })),
    typeReferenceTarget: () => template,
  } };
  const scope = { resolveTypeWithState(type) {
    assert.notEqual(type, erased, "erased arguments are never resolved for carriers");
    return type === template ? carrier(parameters) : parameters[parameterTypes.indexOf(type)];
  } };
  const state = { depth: 0, sourceBindings: new Map() };
  const selected = bindCsharpSourceTypeArguments(scope, receiver, actual, queries, state);
  assert.equal(selected?.sourceBindings.get(first)?.targetType === integer, true);
  assert.equal(selected?.sourceBindings.get(second)?.targetType === byte, true);
  assert.equal(selected?.sourceBindings.get(first)?.sourceType === erased &&
    selected?.sourceBindings.get(second)?.sourceType === erased, true);
  const conflicting = { ...state, sourceBindings: new Map([[first, { sourceType: erased, targetType: byte }]]) };
  assert.equal(bindCsharpSourceTypeArguments(scope, receiver, actual, queries, conflicting) === undefined, true,
    "an actual native binding cannot overwrite a conflicting declaration carrier");
  assert.equal(conflicting.sourceBindings.get(first).targetType === byte && state.sourceBindings.size === 0, true);
  assert.equal(bindCsharpSourceTypeArguments(scope, receiver, { ...actual, id: "Other.Pair" }, queries, state) === undefined,
    true, "a different native declaration cannot bind by checked argument position");
});
