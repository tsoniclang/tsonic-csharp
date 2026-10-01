import assert from "node:assert/strict";
import test from "node:test";
import { bindCsharpSourceDeclarationArguments } from "../../../dist/policy/types/resolution/generic-arguments.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

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
