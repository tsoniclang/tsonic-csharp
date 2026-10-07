import assert from "node:assert/strict";
import test from "node:test";
import { csharpArgumentVectorCallbackResultMatches } from "../../../dist/target-model/types/delegates.js";
import { csharpNeverTargetType, csharpVoidTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/scalar-types.js";
import { csharpJsArgumentVectorCallbackParameter } from "../../../dist/policy/operations/source-profiles/js/replacement-callback.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";

test("argument-vector callbacks preserve exact results and admit nonreturning void callbacks", () => {
  const result = csharpVoidTargetType();
  const vector = { kind: "target-named", id: "Tsonic.CSharp.Js.TimerCallbackArguments" };
  for (const source of [result, csharpNeverTargetType()]) {
    assert.equal(csharpArgumentVectorCallbackResultMatches(source, result), true);
    const callable = csharpDelegateTargetType(source === result ? "System.Action" : "System.Func", [], source === result ? undefined : source);
    const parameter = csharpJsArgumentVectorCallbackParameter("callback", callable, result,
      "Tsonic.CSharp.Js.TimerCallback", "TimerCallback", vector);
    assert.equal(parameter?.csharpSourceArgumentAdapter.sourceCallableType, callable);
  }
  for (const source of [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int32")]) {
    assert.equal(csharpArgumentVectorCallbackResultMatches(source, result), false);
    assert.equal(csharpJsArgumentVectorCallbackParameter("callback", csharpDelegateTargetType("System.Func", [], source), result,
      "Tsonic.CSharp.Js.TimerCallback", "TimerCallback", vector), undefined);
  }
  assert.equal(csharpArgumentVectorCallbackResultMatches(csharpNeverTargetType(), csharpStringTargetType()), false);
  assert.equal(csharpArgumentVectorCallbackResultMatches(csharpStringTargetType(), csharpStringTargetType()), true);
});
