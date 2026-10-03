import assert from "node:assert/strict";
import test from "node:test";
import { sourceNativeCalleeFiles } from "../../../../../tsonic/test/fixtures/source-native-callees.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { planCsharpNativeMethodCallee } from "../../../../dist/backend/planner/expressions/target-members/selected-call/native-callees.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

test("native method planning requires one exact closed member contract", () => {
  const expression = {};
  const receiver = {};
  const declaration = {};
  const carrier = csharpSourcePrimitiveTargetType("int32");
  const selected = { kind: "method", expression, declaration, receiver: { expression: receiver, type: carrier } };
  const member = { memberKind: "method", targetName: "read", type: carrier };
  const sourceOwned = { objectShape: { targetType: carrier }, shapeMember: { kind: "resolved", member },
    jsValueOperation: { kind: "not-js-value" }, runtimeUnionProperty: { kind: "not-runtime-union" } };
  const classification = { selection: { kind: "source-owned", source: { callCallee: true,
    selectedDeclaration: declaration, receiver: { expression: receiver, type: {} } } }, sourceOwned };
  const plan = subject => {
    assert.equal(subject === receiver, true, "only the receiver is evaluated");
    return csharpPlannedValue(carrier, { kind: "IdentifierName", name: "receiver" });
  };
  const invoke = fact => {
    const diagnostics = [];
    const input = { program: { operations: { property: () => fact } } };
    const result = planCsharpNativeMethodCallee(selected, {}, input, diagnostics, plan);
    return { result, diagnostics };
  };
  const valid = invoke(classification);
  assert.equal(valid.result?.name, "read");
  assert.equal(valid.diagnostics.length, 0);
  for (const [label, fact] of [
    ["missing classification", undefined],
    ["not a direct callee", { ...classification, selection: { ...classification.selection,
      source: { ...classification.selection.source, callCallee: false } } }],
    ["missing shape member", { ...classification, sourceOwned: { ...sourceOwned, shapeMember: undefined } }],
    ["rejected shape member", { ...classification, sourceOwned: { ...sourceOwned, shapeMember: { kind: "rejected" } } }],
    ["stored callable field", { ...classification, sourceOwned: { ...sourceOwned,
      shapeMember: { kind: "resolved", member: { ...member, memberKind: "property" } } } }],
    ["JS-value operation", { ...classification, sourceOwned: { ...sourceOwned, jsValueOperation: { kind: "resolved" } } }],
    ["runtime-union operation", { ...classification, sourceOwned: { ...sourceOwned, runtimeUnionProperty: { kind: "resolved" } } }],
  ]) {
    const rejected = invoke(fact);
    assert.equal(rejected.result === undefined, true, label);
    assert.equal(rejected.diagnostics.length, 1, label);
  }
});

for (const surface of ["native", "js"]) {
  test(`direct native callees are syntax rather than acquired delegates in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: sourceNativeCalleeFiles["index.ts"],
      files: { "helper.ts": sourceNativeCalleeFiles["helper.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/\.read\(\)/u.test(generated), true);
    assert.equal(/\.identity<int>\(/u.test(generated), true);
    assert.equal(/new\s+(?:global::)?System\.(?:Action|Func)/u.test(generated), false);
  });
}
