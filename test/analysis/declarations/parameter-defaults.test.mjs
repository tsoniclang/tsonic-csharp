import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpDeclarations } from "../../../dist/analysis/declarations/analyze.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/nullable.js";

function fixture(acceptsOmission, foreign = false) {
  const parameter = {};
  const owner = {};
  const initializer = {};
  const name = {};
  const valueType = { kind: "source-primitive", name: "int32" };
  const syntax = { Initializer: initializer, name };
  const predicateNames = ["FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration",
    "MethodSignatureDeclaration", "GetAccessorDeclaration", "SetAccessorDeclaration"];
  const ast = {
    is: { IsParameterDeclaration: node => node === parameter,
      ...Object.fromEntries(predicateNames.map(predicate => [`Is${predicate}`, () => false])) },
    as: { AsParameterDeclaration: node => node === parameter ? syntax : undefined },
    parent: node => node === parameter ? owner : undefined,
    parameters: node => node === owner ? [parameter] : [],
    forEachChild: () => {},
  };
  const queries = { types: {
    isUnion: () => false, isNullish: () => false, isAny: () => false, isUnknown: () => false,
    declarationSignatureInfo: declaration => {
      assert.equal(declaration === owner, true, "the actual callable owns omission evidence");
      return acceptsOmission === undefined ? undefined : {
        parameters: [{ declaration: foreign ? {} : parameter, acceptsOmission }],
      };
    },
  } };
  const policy = { ast, sourceFiles: [parameter], semanticsFor: () => queries };
  const evidence = { isCompileTimeMetadata: () => false, nodeTargetType: () => valueType,
    contextualTargetType: () => undefined, expressionType: () => ({}) };
  return { parameter, selected: () => analyzeCsharpDeclarations(policy, evidence,
    { property: () => undefined }).runtimeDefault(parameter) };
}

test("native default declarations retain exact omission independently of their initializer and carrier", () => {
  for (const acceptsOmission of [false, true]) {
    const input = fixture(acceptsOmission);
    const selected = input.selected();
    assert.equal(selected.acceptsOmission, acceptsOmission);
    assert.equal(selected.kind, "nullable");
    assert.equal(selected.valueType.name, "int32");
    assert.equal(getCsharpNullableElementTargetType(selected.parameterType).name, "int32");
    assert.equal(Object.isFrozen(selected), true);
  }
});

test("a native default rejects missing or foreign declaration-slot evidence instead of guessing omission", () => {
  for (const input of [fixture(undefined), fixture(true, true), fixture(false, true)]) {
    assert.throws(input.selected, /requires its exact checked declaration slot/u);
  }
});
