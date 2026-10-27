import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpBinaryOperationUsesExpectedResultType } from "../../../dist/policy/operations/operators/expected-result.js";
import { sourceOperatorFromKindName } from "../../../dist/target-model/syntax/operators.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectCsharpCallForm } from "../../../dist/policy/operations/members/call-forms.js";
import { planCsharpOptionalReceiverChain } from "../../../dist/backend/planner/expressions/calls/optional-chain.js";
import { analyzeCsharpOptionalCallChains } from "../../../dist/analysis/callables/calls/optional-call-chains.js";
import { createExpectedNativeUseOwner } from "../../helpers/expected-native-uses.mjs";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { selectCsharpSourceFlowCall } from "../../../dist/policy/operations/flow/source-flow.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

function recordedCalls(compiled) {
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "analyzed program is present");
  const ast = program.source.ast;
  const calls = [];
  for (const sourceFile of csharpProgramSourceFiles(program)) {
    if (!String(ast.getPath(sourceFile)).endsWith("/index.ts")) continue;
    const text = String(ast.getSourceText(sourceFile));
    const visit = node => {
      if (ast.is.IsCallExpression(node)) calls.push({ node, text: text.slice(ast.pos(node), ast.end(node)).trim(),
        classification: program.records.selectedCall.get(node) });
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(sourceFile);
  }
  return calls;
}

function recordedForms(compiled) {
  const program = compiled.result.program;
  const ast = program.source.ast;
  const forms = [];
  for (const sourceFile of csharpProgramSourceFiles(program)) {
    if (!String(ast.getPath(sourceFile)).endsWith("/index.ts")) continue;
    const text = String(ast.getSourceText(sourceFile));
    const visit = (node) => {
      const snippet = () => text.slice(ast.pos(node), ast.end(node)).trim();
      if (ast.is.IsBinaryExpression(node) || ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
        forms.push(`operator ${snippet()} => ${program.records.operatorForm.get(node) ?? "none"}`);
      }
      ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
    };
    visit(sourceFile);
  }
  return forms;
}

function compiledWithoutDiagnostics(options) {
  const compiled = compileCsharpSource(options);
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  return compiled;
}

test("binary and unary forms are recorded once in the planner's order", () => {
  const compiled = compiledWithoutDiagnostics({ surface: "js", sourceText: `
    type T = { a: unknown };
    class A {}
    export function f(x: T, o: any, a: number[], v: unknown, n: number, m: number): unknown {
      let first = 0;
      [first] = a;
      a.length = 0;
      x.a = 1;
      o.p = 1;
      const shape = typeof v === "string";
      const test = v instanceof A;
      const sum = o + 1;
      const less = n < m;
      return [first, shape, test, sum, less, -n];
    }
  ` });
  assert.deepEqual(recordedForms(compiled), [
    "operator [first] = a => destructuring-assignment",
    "operator a.length = 0 => js-array-mutation",
    "operator x.a = 1 => selected",
    "operator o.p = 1 => js-value-write",
    "operator typeof v === \"string\" => typeof-comparison",
    "operator v instanceof A => type-test",
    "operator o + 1 => js-value-operation",
    "operator n < m => selected",
    "operator -n => selected",
  ]);
});

test("operator form readers are frozen, repeatable and absent for foreign and non-operator subjects", () => {
  const compiled = compiledWithoutDiagnostics({ surface: "js", sourceText: `
    export function f(o: any, n: number, m: number): unknown { const sum = o + 1; const less = n < m; return [sum, less, -n]; }
  ` });
  const program = compiled.result.program;
  const ast = program.source.ast;
  const records = program.records;
  assert.equal(Object.isFrozen(records.operatorForm), true, "the operator form family is frozen");
  let operators = 0;
  const visit = (node) => {
    const label = `${ast.kindName(node)}@${ast.pos(node)}`;
    if (ast.is.IsBinaryExpression(node) || ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
      operators += 1;
      const form = records.operatorForm.get(node);
      const eligible = records.operatorForm.usesExpectedResultType(node);
      assert.equal(form !== undefined && records.operatorForm.get(node) === form, true, `${label}: one repeatable form`);
      assert.equal(records.operatorForm.usesExpectedResultType(node) === eligible, true, `${label}: repeatable eligibility`);
    } else {
      assert.equal(records.operatorForm.get(node) === undefined && records.operatorForm.usesExpectedResultType(node) === undefined, true,
        `${label}: a non-operator node has no operator form`);
    }
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of csharpProgramSourceFiles(program)) {
    if (String(ast.getPath(sourceFile)).endsWith("/index.ts")) visit(sourceFile);
  }
  assert.equal(operators === 3, true, "two binary operators and one unary operator are visited");
  const foreign = {};
  assert.equal(records.operatorForm.get(foreign) === undefined && records.operatorForm.usesExpectedResultType(foreign) === undefined, true,
    "a foreign subject has no operator form");
});

test("an assignment without a direct C# operator is a selected form on a native object with unknown-valued fields", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    type T = { a: unknown };
    export function f(x: T): void { x.toString ||= () => "y"; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, category, source, message }) => ({ code, category, source, message })),
    [{ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      message: "Source operator '||=' requires a dedicated C# translation policy." }],
  );
  assert.equal(compiled.source.ast.kindName(compiled.result.diagnostics[0].sourceNode), "KindBinaryExpression");
});

test("an update of a native unknown-valued field keeps its scalar runtime-operation refusal", () => {
  for (const [operation, kind] of [["x.a++", "KindPostfixUnaryExpression"], ["++x.a", "KindPrefixUnaryExpression"]]) {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
      type T = { a: any };
      export function f(x: T): void { ${operation}; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(
      compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
      [{ code: "CSHARP_UNSUPPORTED_AST",
        message: "The closed C# JS-value runtime has no operation for unary operator '++'." }],
    );
    assert.equal(compiled.source.ast.kindName(compiled.result.diagnostics[0].sourceNode), kind, `${operation}: the exact source update is rejected`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      `${operation}: the source rejection precedes publication and native planning`);
  }
});

test("binary expected-result eligibility is stored once from the checked operator that every selection carries", () => {
  for (const [surface, sourceText] of [
    ["native", `
      import type { int32 } from "@tsonic/core/types.js";
      function touch(value: int32): int32 { return value; }
      export function f(a: int32, b: int32, c: int32 | undefined, flag: boolean): number {
        const wide: number = a + b;
        const narrow: int32 = a << b;
        const both: boolean = flag && a === b;
        const pick: int32 = c ?? a;
        const last: number = (touch(a), b);
        let total: int32 = a;
        total += b;
        return both ? wide + last : -narrow + total + pick;
      }
    `],
    ["js", `
      export function f(a: number, b: string | undefined, s: string): string {
        const sum: number = a * 2;
        const text: string = b ?? s;
        return s + sum + text;
      }
    `],
  ]) {
    const compiled = compiledWithoutDiagnostics({ surface, sourceText });
    const program = compiled.result.program;
    const ast = program.source.ast;
    const records = program.records;
    const expected = createExpectedNativeUseOwner(compiled).analysis;
    let eligibleContextual = 0;
    let ineligible = 0;
    let unary = 0;
    for (const sourceFile of csharpProgramSourceFiles(program)) {
      if (!String(ast.getPath(sourceFile)).endsWith("/index.ts")) continue;
      const text = String(ast.getSourceText(sourceFile));
      const visit = (node) => {
        const label = `${surface} ${text.slice(ast.pos(node), ast.end(node)).trim()}`;
        if (ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
          assert.equal(records.operatorForm.usesExpectedResultType(node) === undefined, true, `${label}: a unary operator has no binary eligibility`);
          unary += 1;
        }
        if (ast.is.IsBinaryExpression(node)) {
          const checked = sourceOperatorFromKindName(ast.operatorKindName(node));
          const eligible = records.operatorForm.usesExpectedResultType(node);
          assert.equal(eligible === (checked === undefined ? undefined : csharpBinaryOperationUsesExpectedResultType(checked)), true,
            `${label}: the stored eligibility is the policy result for the checked operator`);
          const baseline = records.binaryOperation.get(node)?.target;
          assert.equal(baseline?.kind !== "resolved" || baseline.sourceOperator === checked, true, `${label}: the baseline selection carries the checked operator`);
          for (const target of expected.expectedType.get(node)) {
            const selection = expected.expectedBinary.get(node, target);
            if (selection?.kind !== "resolved") continue;
            assert.equal(selection.sourceOperator === checked && records.operatorForm.get(node) !== undefined, true,
              `${label}: a contextual selection carries the checked operator and has a stored form`);
            if (eligible === true && targetTypeRefEquals(selection.resultType, target)) eligibleContextual += 1;
          }
          if (eligible === false) ineligible += 1;
        }
        ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
      };
      visit(sourceFile);
    }
    assert.equal(eligibleContextual > 0 && ineligible > 0, true, `${surface}: eligible contextual results and ineligible operators are covered`);
    assert.equal(surface === "js" || unary > 0, true, `${surface}: a unary operator is covered`);
  }
});

test("call forms are published from checked evidence for every real native and JS call", () => {
  for (const [name, options, expected] of [
    ["native", { sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { keepalive } from "@tsonic/core/lang.js";
      function use(value: int): int { return value; }
      export function f(value: int): int { keepalive(value); return use(value); }
    ` }, [["keepalive(value)", "keep-alive"], ["use(value)", "target"]]],
    ["JS", { surface: "js", sourceText: `
      export function f(value: unknown, invoke: any): unknown { return Array.isArray(value) ? invoke(1) : undefined; }
    ` }, [["Array.isArray(value)", "type-test"], ["invoke(1)", "js-value"]]],
  ]) {
    const compiled = compiledWithoutDiagnostics(options);
    const calls = recordedCalls(compiled);
    assert.deepEqual(calls.map(call => [call.text, call.classification?.form?.kind]), expected, name);
    for (const call of calls) {
      const form = call.classification.form;
      assert.equal(Object.isFrozen(form), true, `${name} ${call.text}: frozen form`);
      assert.equal(compiled.result.program.records.selectedCall.get(call.node).form === form, true, `${name} ${call.text}: lookup identity`);
      assert.equal("typeTest" in call.classification || "sourceFlow" in call.classification || "jsValue" in call.classification, false,
        `${name} ${call.text}: superseded decision fields absent`);
      assert.equal(call.classification.source?.call === call.node, true, `${name} ${call.text}: original source call`);
      if (form.kind === "keep-alive") {
        assert.equal(form.sourceFlow.valueExpression === call.classification.source.sourceArguments[0].expression, true,
          `${name} ${call.text}: original source argument`);
      }
    }
    assert.equal(compiled.result.program.records.selectedCall.get({}) === undefined, true, `${name}: foreign node has no record`);
  }
});

test("source-flow rejection keeps its exact descriptor and source call through the current rejection owner", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    import { move } from "@tsonic/core/lang.js";
    export function f(value: int): int { return move(value); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 1);
  const diagnostic = compiled.result.diagnostics[0];
  assert.equal(diagnostic.code, "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED");
  assert.equal(diagnostic.message, "C# target does not implement source flow marker 'move'; this intrinsic requires an explicit target contract and cannot be erased or lowered as an identity call.");
  assert.equal(compiled.source.ast.kindName(diagnostic.sourceNode), "KindCallExpression");
  assert.equal(compiled.artifacts.size, 0);
  const source = createTargetSourceProgram(compiled.source);
  const calls = [];
  const visit = node => {
    if (source.ast.is.IsCallExpression(node)) calls.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) visit(file);
  assert.equal(calls.length, 1);
  const selected = selectCsharpSourceFlowCall({ ast: source.ast, sourceFacts: source.sourceFacts }, calls[0]);
  const form = selectCsharpCallForm(undefined, selected, { kind: "not-js-value" });
  assert.equal(form?.kind === "source-flow-rejected", true, "source rejection is a selected form");
  assert.equal(Object.isFrozen(form.sourceFlow), true, "source rejection descriptor is frozen");
  assert.equal(form.sourceFlow.code === diagnostic.code && form.sourceFlow.reason === diagnostic.message, true, "rejection is preserved exactly");
  assert.equal(diagnostic.sourceNode === calls[0], true, "rejection remains on the original call");
  assert.equal(compiled.result.program === undefined, true, "the owning source refusal precedes the program seal");
});

test("local functions named like core markers remain ordinary calls, including shadowing", () => {
  const compiled = compiledWithoutDiagnostics({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    import { keepalive as retain } from "@tsonic/core/lang.js";
    function move(value: int): int { return value; }
    function keepalive(value: int): int { return value; }
    export function f(value: int): int { retain(value); return move(keepalive(value)); }
  ` });
  assert.deepEqual(recordedCalls(compiled).map(call => [call.text, call.classification?.form?.kind]), [
    ["retain(value)", "keep-alive"], ["move(keepalive(value))", "target"], ["keepalive(value)", "target"],
  ]);
});

test("selected call forms preserve native argument evaluation and do not add wrappers", () => {
  const compiled = compiledWithoutDiagnostics({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    import { keepalive } from "@tsonic/core/lang.js";
    let count: int = 0;
    function next(): int { count++; return count; }
    function move(value: int): int { return value; }
    export function run(): boolean { keepalive(next()); return move(next()) === 2 && count === 2; }
  ` });
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(typeof output === "string", true, "native source was emitted");
  assert.equal(output.includes("global::System.GC.KeepAlive(global::Tsonic.Generated.Index.next())"), true, "direct native keep-alive argument");
  assert.equal(output.includes("global::Tsonic.Generated.Index.move(global::Tsonic.Generated.Index.next())"), true, "ordinary direct call");
  executeCsharpConstruction(compiled, "selected-call-form-owner");
});

test("optional-chain routing reads the canonical disposition even when another form beats a resolved JS operation", () => {
  const node = Object.freeze({ label: "call" });
  const receiver = Object.freeze({ label: "receiver" });
  const type = Object.freeze({ kind: "source-primitive", name: "float64" });
  const noFlow = { kind: "not-source-flow" };
  const noJs = { kind: "not-js-value" };
  let checked = 0;
  for (const [name, typeTest, flow] of [
    ["type test", { label: "type test" }, noFlow],
    ["keep-alive", undefined, { kind: "keep-alive", valueExpression: receiver }],
    ["source-flow refusal", undefined, { kind: "rejected", code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED", reason: "marker" }],
    ["ordinary form", undefined, noFlow],
  ]) for (const operation of [noJs, { kind: "resolved", resultType: type }, { kind: "rejected", reason: "JS" }]) {
    const form = selectCsharpCallForm(typeTest, flow, operation);
    const classification = { form, selectedResultType: type, optionalReceiver: { expression: receiver, storage: type, type, guard: true } };
    let receiverPlans = 0;
    const diagnostics = [];
    // The chain analysis seals the routing from the canonical call form: direct for a resolved JS call, guarded otherwise.
    const selectedCall = { get: subject => subject === node ? classification : undefined };
    const chains = analyzeCsharpOptionalCallChains({ is: { IsCallExpression: subject => subject === node } }, [node], { selectedCall },
      { nativeUse: { expression: subject => subject === receiver ? { use: { kind: "value", expression: receiver, carrier: type } } : undefined } },
      () => true);
    assert.deepEqual(chains.issues, [], `${name}/${operation.kind}: the chain is admitted`);
    const result = planCsharpOptionalReceiverChain(node, {}, {
      program: { records: { selectedCall, optionalCallChain: chains.records.optionalCallChain },
        source: { ast: { is: { IsCallExpression: () => false } } } },
    }, diagnostics, () => { receiverPlans += 1; return undefined; }, () => undefined, () => { throw new Error("unreachable call renderer"); });
    assert.equal(result.handled, operation.kind !== "resolved", `${name}/${operation.kind}: exact prior chain ownership`);
    assert.equal(receiverPlans, operation.kind === "resolved" ? 0 : 1, `${name}/${operation.kind}: exact receiver planning count`);
    assert.equal(diagnostics.length, 0, `${name}/${operation.kind}: no new refusal`);
    checked += 1;
  }
  assert.equal(checked, 12, "all winning/losing JS overlap combinations were routed");
});

test("real optional JS and native calls retain one canonical call descriptor", () => {
  for (const [name, options, expected] of [
    ["native", { sourceText: `import type { int } from "@tsonic/csharp/types.js";
      export function f(invoke: ((value: int) => int) | undefined): int | undefined { return invoke?.(1); }` }, "target"],
    ["JS", { surface: "js", sourceText: `export function f(invoke: any): unknown { return invoke?.(1); }` }, "js-value"],
  ]) {
    const compiled = compiledWithoutDiagnostics(options);
    const calls = recordedCalls(compiled);
    assert.equal(calls.length, 1, `${name}: one optional invocation`);
    assert.equal(calls[0].classification.form.kind, expected, name);
    assert.equal("jsValue" in calls[0].classification, false, `${name}: no alternate raw call classification`);
    assert.equal(compiled.artifacts.size > 0, true, `${name}: generated output is present`);
  }
});
