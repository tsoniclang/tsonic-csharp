import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { closedNativeAbsenceGuardPolicySource } from "../../../../tsonic/test/fixtures/closed-native-absence-guards.mjs";
import { selectCsharpNativeGuardResult } from "../../../dist/policy/types/resolution/native-flow-refinement.js";
import { csharpAbsenceTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/scalar-types.js";

test("absence folding requires native absence admission, not an object runtime category", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": closedNativeAbsenceGuardPolicySource,
  }, compilerOptions: { strict: true, module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const context = { ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts,
    semanticsFor: node => source.semantics.forNode(node) };
  const expressions = [];
  const visit = node => {
    if (source.ast.is.IsIfStatement(node)) expressions.push(source.ast.as.AsIfStatement(node).Expression);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(checked.getSourceFile("/src/index.ts"));
  assert.equal(expressions.length, 4);
  const value = csharpTsValueTargetType();
  const shaped = { ...value, id: "closed-record", csharpTypeofRuntimeKind: "object", csharpJsObjectShape: true };
  for (const carrier of [value, shaped, csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64"))]) {
    assert.deepEqual(expressions.map(expression => selectCsharpNativeGuardResult(context, expression, () => carrier)),
      [undefined, undefined, undefined, undefined]);
  }
  assert.deepEqual(expressions.map(expression => selectCsharpNativeGuardResult(context, expression,
    () => csharpAbsenceTargetType())), [true, false, true, false]);
  assert.deepEqual(expressions.map(expression => selectCsharpNativeGuardResult(context, expression,
    () => csharpSourcePrimitiveTargetType("int64"))), [false, true, false, true]);
});
