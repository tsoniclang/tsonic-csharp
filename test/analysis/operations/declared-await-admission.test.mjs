import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpAwaitAdmission } from "../../../dist/analysis/callables/async/await-admission.js";
import { selectCsharpAwaitCompletion } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { promiseConstructorMember, promiseResolutionMember } from "../../../dist/policy/operations/source-profiles/promise-source-profile.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import {
  csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTaskTargetType,
  getCsharpDelegateSignature,
  getCsharpRuntimeUnionArms,
  getCsharpTaskResultTargetType,
  isCsharpVoidTargetType,
  targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";

const wide = csharpSourcePrimitiveTargetType("int64");
const narrow = csharpSourcePrimitiveTargetType("int32");
const pending = csharpTaskTargetType(wide);
const awaited = csharpSourcePrimitiveTargetType("float64");
const awaitedTask = csharpTaskTargetType(awaited);

function fixture(body) {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: { "/src/index.ts": `export async function settle(value: Promise<number>) { ${body} }` },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  const diagnostics = checked.diagnostics.filter(diagnostic => diagnostic !== undefined);
  assert.equal(diagnostics.length, 0, formatDiagnostics(diagnostics).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  assert.equal(file !== undefined, true, "the original checked file is present");
  const awaits = [];
  const visit = node => {
    if (source.ast.is.IsAwaitExpression(node)) awaits.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(awaits.length, 1, "one exact checked await owns the completion");
  const node = awaits[0];
  return { ast: source.ast, node, expression: source.ast.as.AsAwaitExpression(node).Expression };
}

function admit(selected, changes = {}) {
  const completion = selectCsharpAwaitCompletion(awaitedTask, undefined, "consumed");
  assert.equal(completion !== undefined, true, "a native Task has a completed signature");
  const carriers = new Map([[selected.expression, { value: awaitedTask }], [selected.node, { value: awaited }]]);
  if (changes.missingOperand) carriers.delete(selected.expression);
  if (changes.missingResult) carriers.delete(selected.node);
  if (changes.wrongResult) carriers.set(selected.node, { value: narrow });
  const use = { kind: changes.erased ? "erased" : "runtime", expression: selected.node };
  return analyzeCsharpAwaitAdmission({
    ast: selected.ast,
    demand: { entries: changes.repeated ? [{ use }, { use }] : [{ use }] },
    values: { valueRead: carriers },
    operations: { awaitCompletion: new Map(changes.missingCompletion ? [] : [[selected.node, completion]]) },
  });
}

for (const [name, body] of [
  ["expression statement", "await value;"],
  ["transparent parentheses", "((await value));"],
  ["explicit void", "void (await value);"],
]) {
  test(`declared await admission needs no invented payload for a discarded ${name}`, () => {
    const selected = fixture(body);
    assert.deepEqual(admit(selected, { missingResult: true }), []);
  });
}

for (const [name, body] of [
  ["returned result", "return await value;"],
  ["stored result", "const result = await value; return result;"],
  ["passed result", "console.log(await value);"],
]) {
  test(`declared await admission retains exact native payload proof for a ${name}`, () => {
    const selected = fixture(body);
    assert.deepEqual(admit(selected), []);
    for (const changes of [{ missingResult: true }, { wrongResult: true }]) {
      const issues = admit(selected, changes);
      assert.equal(issues.length, 1);
      assert.equal(issues[0].sourceNode === selected.node, true, "the original used await is the issue subject");
      assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST");
      assert.match(issues[0].message, /finalized await-result carrier/u);
    }
  });
}

for (const [name, changes] of [
  ["operand carrier", { missingOperand: true }],
  ["canonical completion", { missingCompletion: true }],
]) {
  test(`discarded await still refuses a missing ${name}`, () => {
    const selected = fixture("await value;");
    const issues = admit(selected, { ...changes, missingResult: true });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].sourceNode === selected.node, true, "discard does not substitute another source owner");
    assert.match(issues[0].message, /Runtime carrier fact is missing for the awaited expression/u);
  });
}

test("repeated native-demand entries preserve one original await diagnostic", () => {
  const selected = fixture("return await value;");
  const issues = admit(selected, { missingResult: true, repeated: true });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].sourceNode === selected.node, true);
});

test("erased demand does not invent an executable await requirement", () => {
  const selected = fixture("return await value;");
  assert.deepEqual(admit(selected, { erased: true, missingOperand: true, missingResult: true, missingCompletion: true }), []);
});

test("Promise constructor publishes its raw nested Task signature without adopting or copying its input", () => {
  const nested = csharpTaskTargetType(pending);
  const member = promiseConstructorMember(nested);
  assert.equal(member !== undefined, true);
  assert.equal(targetTypeRefEquals(member.returnType, nested), true);
  assert.equal(targetTypeRefEquals(getCsharpTaskResultTargetType(member.returnType), pending), true,
    "the call-site completion, not constructor publication, owns C1373 adoption");
  const executor = getCsharpDelegateSignature(member.parameters[0].type);
  const resolver = getCsharpDelegateSignature(executor.parameters[0]);
  const alternatives = getCsharpRuntimeUnionArms(resolver.parameters[0]);
  assert.equal(alternatives.length, 2);
  assert.equal(alternatives.some(arm => targetTypeRefEquals(arm, pending)), true);
  assert.equal(alternatives.some(arm => targetTypeRefEquals(arm, nested)), true);
  assert.equal(member.csharpInvocation.kind, "static-factory-construction");
  assert.equal(Object.isFrozen(member) && Object.isFrozen(member.parameters), true);
});

test("Promise union-result publication retains the Task arm and exact native scalar width", () => {
  const payload = csharpRuntimeUnionTargetType([pending, wide]);
  const member = promiseConstructorMember(csharpTaskTargetType(payload));
  assert.equal(member !== undefined, true);
  assert.equal(targetTypeRefEquals(getCsharpTaskResultTargetType(member.returnType), payload), true);
  const alternatives = getCsharpRuntimeUnionArms(getCsharpTaskResultTargetType(member.returnType));
  assert.equal(alternatives.some(arm => targetTypeRefEquals(arm, pending)), true);
  assert.equal(alternatives.some(arm => targetTypeRefEquals(arm, wide)), true);
  assert.equal(alternatives.some(arm => targetTypeRefEquals(arm, narrow)), false);
});

test("native Promise resolution retains the selected nested native signature and refuses a foreign payload", () => {
  const nested = csharpTaskTargetType(pending);
  const member = promiseResolutionMember(nested, pending);
  assert.equal(member !== undefined, true);
  assert.equal(member.parameters[0].type === nested, true, "the actual Task is forwarded once without a wrapper");
  assert.equal(targetTypeRefEquals(member.returnType, nested), true);
  assert.equal(member.csharpInvocation.kind, "native-task-resolution");
  assert.equal(member.csharpInvocation.form, "task");
  assert.equal(promiseResolutionMember(nested, narrow) === undefined, true, "a different native payload is not retargeted");
});

test("discarded bare-T await publishes one native Task test and no invented result on both surfaces", () => {
  for (const surface of ["native", "js"]) {
    const compiled = compileCsharpSource({ surface, sourceText:
      "export async function observe<T>(x: T): Promise<void> { await x; }" });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "only complete native facts are published");
    const file = compiled.source.getSourceFile("/project/index.ts");
    assert.equal(file !== undefined, true, "the original declaration is retained");
    const awaits = [];
    const visit = node => {
      if (program.source.ast.is.IsAwaitExpression(node)) awaits.push(node);
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
    assert.equal(awaits.length, 1);
    const completion = program.records.awaitCompletion.get(awaits[0]);
    assert.equal(completion?.form, "task-test");
    assert.equal(completion.discard, true);
    assert.equal(isCsharpVoidTargetType(completion.result), true);
    assert.equal(isCsharpVoidTargetType(program.records.valueRead.get(awaits[0])?.value), true,
      "the actual result producer publishes the canonical void completion");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal([...generated.matchAll(/\bis\s+(?:global::)?(?:System\.Threading\.Tasks\.)?Task\b/gu)].length, 1);
    assert.equal([...generated.matchAll(/\bawait\b/gu)].length, 1);
    assert.match(generated, /\bif\s*\(\s*x\s+is\b/u, "the same original parameter is tested once");
    assert.equal([...generated.matchAll(/\bx\b/gu)].length, 2, "one parameter declaration and one runtime read");
    assert.doesNotMatch(generated, /\b(?:dynamic|GetType|GetProperty|TaskCompletionSource)\b/u,
      "no reflection, dynamic fallback or synthetic completion allocation");
  }
});
