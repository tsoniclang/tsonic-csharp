import assert from "node:assert/strict";
import test from "node:test";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { selectCsharpAwaitCompletion } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType,
  csharpTaskTargetType, csharpVoidTargetType, csharpSourcePrimitiveTargetType,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("optional Task lifting preserves arity, payload and non-null requirements", () => {
  const policy = createNativeConversionHost();
  const integer = csharpSourcePrimitiveTargetType("int32");
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const unit = csharpVoidTargetType();
  const task = csharpTaskTargetType(unit);
  const optional = csharpNullableTargetType(task);
  const compiled = analyzeCsharpSource({ surface: "js", sourceText: `
    export declare function original(value: Promise<void> | void, empty: void): void;
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "the genuine program owns one Native representation view");
  const program = compiled.analysis.value;
  const source = program.source;
  const declaration = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))
    .flatMap(file => source.ast.statements(file)).find(node => source.ast.is.IsFunctionDeclaration(node));
  assert.equal(declaration !== undefined, true, "the original declared signature is retained");
  const represented = source.ast.parameters(declaration).map(parameter => {
    const slot = resolvedSourceValue(source.facts.values.declaredSlot(parameter), "the original Task/void slot");
    const outcome = program.representation.represent(slot.type, "storage", parameter);
    assert.equal(outcome.kind, "represented", "Source absence is represented once without a Native Source-sum producer");
    return outcome.value.carrier;
  });
  assert.equal(targetTypeRefEquals(represented[0], optional), true, "void-bearing Task uses the actual nullable Task ABI");
  assert.equal(targetTypeRefEquals(represented[1], unit), true, "whole void does not become an optional payload");
  assert.deepEqual(selectCsharpConversion(policy, task, optional, "implicit"), { kind: "implicit", proof: "nullable" });
  assert.deepEqual(selectCsharpConversion(policy, csharpAbsenceTargetType(), optional, "implicit"), { kind: "absence" });
  assert.equal(selectCsharpConversion(policy, csharpTaskTargetType(integer), optional, "implicit").kind, "implicit");
  for (const [source, target] of [[optional, task],
    [task, csharpTaskTargetType(integer)], [csharpTaskTargetType(integer), csharpTaskTargetType(boolean)],
    [integer, optional], [unit, optional]]) {
    assert.equal(selectCsharpConversion(policy, source, target, "implicit").kind, "rejected");
  }
  const adapter = selectCsharpConversion(policy, csharpDelegateTargetType("System.Action", []), csharpDelegateTargetType("System.Func", [], optional), "implicit");
  assert.equal(adapter.kind, "delegate-adapter");
  assert.deepEqual(adapter.returnConversion, { kind: "void-return" });
  assert.ok(targetTypeRefEquals(selectCsharpAwaitCompletion(optional)?.result, unit));
  assert.ok(targetTypeRefEquals(selectCsharpAwaitCompletion(csharpNullableTargetType(csharpTaskTargetType(integer)))?.result, csharpNullableTargetType(integer)));
});
