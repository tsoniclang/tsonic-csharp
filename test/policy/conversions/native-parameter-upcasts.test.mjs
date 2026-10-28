import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const policy = { projectTypes: { directSupertypes: () => [] }, providers: {
  findTargetBindingByTargetId: () => ({ kind: "missing" }),
} };

test("native type-parameter upcasts consume exact resolved constraints without changing the source carrier", () => {
  const value = { kind: "type-parameter", identity: "owner:Value", name: "Value",
    csharpConstraints: { kind: "resolved", constraints: [] } };
  const actual = { kind: "type-parameter", identity: "owner:Actual", name: "Actual",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: value }] } };
  assert.equal(selectCsharpConversion(policy, actual, value, "implicit").kind, "implicit",
    "the original Actual parameter upcasts through its native Value constraint");
  const target = csharpRuntimeUnionTargetType([value, csharpTaskTargetType(value)]);
  const injection = selectCsharpConversion(policy, actual, target, "implicit");
  assert.equal(injection.kind === "implicit" && injection.proof === "runtime-union-arm" && injection.armIndex === 0, true,
    "only the constrained value arm accepts the original generic source");
  for (const constraints of [undefined, { kind: "unsupported", reason: "not admitted" },
    { kind: "resolved", constraints: [] }]) {
    const unrelated = { kind: "type-parameter", identity: "owner:Unrelated", name: "Unrelated", csharpConstraints: constraints };
    assert.equal(selectCsharpConversion(policy, unrelated, value, "implicit").kind, "rejected",
      "an absent, unsupported or empty native constraint supplies no upcast evidence");
  }
  const chained = { kind: "type-parameter", identity: "owner:Chained", name: "Chained",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: actual }] } };
  assert.equal(selectCsharpConversion(policy, chained, value, "implicit").kind, "implicit",
    "a complete native type-constraint chain preserves the same upcast authority");
  const cyclic = { kind: "type-parameter", identity: "owner:Cycle", name: "Cycle" };
  cyclic.csharpConstraints = { kind: "resolved", constraints: [{ kind: "type", type: cyclic }] };
  assert.equal(selectCsharpConversion(policy, cyclic, value, "implicit").kind, "rejected",
    "a native constraint cycle does not manufacture a conversion");
  assert.equal(selectCsharpConversion(policy, value, actual, "implicit").kind, "rejected",
    "the native upcast does not establish a reverse downcast");
});

for (const surface of ["native", "js"]) {
  test(`native generic constraint upcasts preserve exact wide inputs on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function widen<Value, Actual extends Value>(actual: Actual): Value { return actual; }
export function run(): boolean {
  const wide: int64 = 9007199254740993n;
  return widen<int64, int64>(wide) === wide && widen<string, string>("native") === "native";
}` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/where Actual : Value/u.test(output), true, "native constraints remain on the original generic declaration");
    assert.equal(/TsValue|Convert\.ToDouble|DynamicInvoke/u.test(output), false,
      "native upcasting uses no dynamic, lossy or erased transport");
    executeCsharpConstruction(compiled, `native-parameter-upcasts-${surface}`);
  });
}
