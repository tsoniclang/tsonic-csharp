import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpParameterListCarrier } from "../../../../dist/policy/types/callables/parameter-list.js";
import { csharpSourceCallArgumentParameter } from "../../../../dist/policy/types/callables/source-callable-contract.js";
import { csharpCallableValueType } from "../../../../dist/policy/types/callables/value-type.js";
import { csharpJsArrayTargetType } from "../../../../dist/target-model/types/carriers/js.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../../../dist/target-model/types/carriers/scalar-types.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const string = csharpStringTargetType();
const ints = { kind: "array", element: int32 };

test("a parameter list without rest is one exact tuple of its parameter carriers", () => {
  assert.deepEqual(selectCsharpParameterListCarrier([int32, string], [], false), { kind: "tuple", elements: [int32, string] });
});

test("a rest parameter list becomes one native array only when every element has the rest element carrier", () => {
  assert.deepEqual(selectCsharpParameterListCarrier([int32, ints], [1], false), { kind: "array", element: int32 });
  assert.deepEqual(selectCsharpParameterListCarrier([int32, ints], [1], true), csharpJsArrayTargetType(int32));
  assert.equal(selectCsharpParameterListCarrier([string, ints], [1], false), undefined, "mixed element carriers have no array form");
  assert.equal(selectCsharpParameterListCarrier([int32, ints, ints], [1, 2], false), undefined, "two rest parameters are unsupported");
  assert.equal(selectCsharpParameterListCarrier([int32, int32], [1], false), undefined, "a rest slot needs a collection carrier");
});

test("an effective argument index selects its declared parameter; arguments past a params array select that array", () => {
  const parameter = (name, targetParameter) => ({ name, targetParameter });
  const fixed = { kind: "native", nativeParameters: [parameter("first", { type: int32 }), parameter("second", { type: string })] };
  assert.equal(csharpSourceCallArgumentParameter(fixed, 1).name, "second");
  assert.equal(csharpSourceCallArgumentParameter(fixed, 2), undefined, "an argument past a fixed list has no parameter");
  const variadic = { kind: "native", nativeParameters: [parameter("format", { type: string }), parameter("values", { type: ints, paramsArray: true })] };
  assert.equal(csharpSourceCallArgumentParameter(variadic, 0).name, "format");
  for (const index of [1, 2, 7]) assert.equal(csharpSourceCallArgumentParameter(variadic, index).name, "values", String(index));
});

test("a non-generic source callable's value carrier is its exact native delegate, keeping optional and rest slots", () => {
  const callable = {
    kind: "native",
    methodTypeParameterIdentities: [],
    nativeParameters: [{ targetParameter: { type: int32 } }, { targetParameter: { type: string, optional: true } }],
    returnType: csharpVoidTargetType(),
  };
  const action = csharpCallableValueType(callable);
  assert.equal(action.id, "System.Action`2");
  assert.deepEqual(action.csharpDelegateSignature.parameters, [int32, string]);
  assert.deepEqual(action.csharpDelegateSignature.optionalParameterIndexes, [1]);
  const func = csharpCallableValueType({ ...callable, nativeParameters: [{ targetParameter: { type: ints, paramsArray: true } }], returnType: int32 });
  assert.equal(func.id, "System.Func`2");
  assert.equal(func.csharpDelegateSignature.restParameterIndex, 0);
  assert.equal(csharpCallableValueType({ ...callable, methodTypeParameterIdentities: ["owner:f:T"] }), undefined,
    "a generic method has no single closed delegate carrier");
});
