import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpNativeDemand, collectCsharpNativeUses } from "../../../dist/analysis/control-flow/native-demand/analyze.js";
import { selectCsharpSourceArgumentGrouping } from "../../../dist/policy/operations/members/selection/source-argument-groups.js";
import {
  csharpSelectedTargetArgumentBindings,
  csharpSourceOwnedArgumentBindings,
} from "../../../dist/target-model/records/native-demand.js";

const groupingRefusal = "Source-owned arguments have no exact native parameter grouping.";

function ownerInput(program, overrides = {}) {
  const records = program.records;
  return {
    ast: program.source.ast,
    sourceFiles: program.sourceFiles,
    navigation: program.sourceNavigation,
    evidence: records,
    operations: records,
    valueReads: records,
    attributeApplications: records,
    classFactories: { classFactory: records.classFactory, factories: program.classFactories },
    classInitialization: records,
    projectTypes: program.projectTypes,
    safetyApplications: records,
    participation: { get: () => undefined },
    expectedUse: { get: () => undefined },
    unusedDefault: { get: () => false },
    ...overrides,
  };
}

function sourceText(program, node) {
  const ast = program.source.ast;
  return String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/g, " ");
}

function findNode(program, kindName, text) {
  const ast = program.source.ast;
  let found;
  const visit = (node) => {
    if (found === undefined && ast.kindName(node) === kindName && sourceText(program, node) === text) found = node;
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) {
    if (String(ast.getPath(sourceFile)).endsWith("/index.ts")) visit(sourceFile);
  }
  return found;
}

function indexFile(program) {
  const ast = program.source.ast;
  return program.sourceFiles.find((sourceFile) => String(ast.getPath(sourceFile)).endsWith("/index.ts"));
}

function plannedOrder(program, uses, construct) {
  const ast = program.source.ast;
  const flattened = [];
  const visitSteps = (steps) => {
    for (const step of steps) {
      if (step.kind === "construct") {
        flattened.push(`construct ${ast.kindName(step.construct)}`);
        visitSteps(uses.order(step.construct) ?? []);
        continue;
      }
      const use = uses.get(step.site);
      flattened.push(`use ${step.site.role} ${use === undefined ? "unadmitted" : sourceText(program, use.expression)}`);
      if (use !== undefined && use.kind !== "erased") visitSteps(uses.order(use.expression) ?? []);
    }
  };
  visitSteps(uses.order(construct) ?? []);
  return flattened;
}

function roles(program, uses, sites) {
  return sites.map((site) => `${site.role} ${sourceText(program, uses.get(site)?.expression)}`);
}

test("an unsupported source argument grouping is an explicit refusal, never a successful prefix", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    function pair(first: int32, second: int32): int32 { return first + second; }
    function triple(first: int32, second: int32, third: int32): int32 { return first + second + third; }
    export function spread(values: [int32, int32]): int32 { return pair(...values); }
    export function prefixed(values: [int32, int32]): int32 { return triple(1 as int32, ...values); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the program is published with planner diagnostics");
  const refusals = compiled.result.diagnostics.filter((diagnostic) => diagnostic.message === groupingRefusal);
  assert.equal(refusals.length === 2, true, "the planner keeps the existing grouping refusal for both calls");
  const demand = analyzeCsharpNativeDemand(ownerInput(program));
  const entries = collectCsharpNativeUses(ownerInput(program));
  for (const text of ["pair(...values)", "triple(1 as int32, ...values)"]) {
    const call = findNode(program, "KindCallExpression", text);
    assert.equal(program.records.selectedCall.get(call)?.sourceArgumentGrouping?.kind === "refused", true, `${text}: the sealed grouping is refused`);
    assert.equal(refusals.some((diagnostic) => diagnostic.sourceNode === call), true, `${text}: the refusal is reported at the call`);
    assert.equal(demand.unadmitted.some((entry) => entry.expression === call && entry.reason === "argument-grouping-refused"), true,
      `${text}: the call stays in the required domain as an unadmitted refusal`);
    assert.equal(entries.some(({ site, use }) => site.subject === call || use.expression === call), false,
      `${text}: no argument prefix and no successful call use is published`);
  }
});

test("a missing argument type is unresolved, distinct from a structural refusal, and is not cached", () => {
  const program = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    function pair(first: int32, second: int32): int32 { return first + second; }
    export function run(): int32 { return pair(1 as int32, 2 as int32); }
  ` }).result.program;
  const call = findNode(program, "KindCallExpression", "pair(1 as int32, 2 as int32)");
  const classification = program.records.selectedCall.get(call);
  const source = classification.source;
  const final = selectCsharpSourceArgumentGrouping(source, classification.sourceNativeParameters, classification.sourceArgumentParameterTypes);
  const provisional = selectCsharpSourceArgumentGrouping(source, classification.sourceNativeParameters,
    classification.sourceArgumentParameterTypes.map((type, index) => index === 1 ? undefined : type));
  assert.equal(final.kind === "grouped" && final.arguments.length === 2, true, "final types group every argument");
  assert.equal(provisional.kind === "unresolved", true, "a missing argument type is unresolved, not refused");
  assert.equal(csharpSourceOwnedArgumentBindings(provisional).kind === "unresolved", true, "the key derivation keeps the unresolved state");
  assert.equal(csharpSourceOwnedArgumentBindings(final).kind === "bound", true, "the same call with its final types is bound");
  const pending = { ...classification, sourceArgumentGrouping: provisional };
  const operations = { ...program.records, selectedCall: { get: (node) => node === call ? pending : program.records.selectedCall.get(node) } };
  const demand = analyzeCsharpNativeDemand(ownerInput(program, { operations }));
  assert.equal(demand.unadmitted.some((entry) => entry.expression === call && entry.reason === "argument-type-unresolved"), true,
    "the owner reports the unresolved call instead of a prefix");
  const again = analyzeCsharpNativeDemand(ownerInput(program));
  assert.equal(again.unadmitted.some((entry) => entry.expression === call), false, "a later evaluation with final types is not affected");
});

test("a corrupt finalized target sequence fails the analysis invariant instead of returning a prefix", () => {
  const program = compileCsharpSource({ surface: "js", sourceText: `
    import type { uint8 } from "@tsonic/core/types.js";
    export function run(tuple: [uint8, number]): string { return String.fromCharCode(...tuple); }
  ` }).result.program;
  const call = findNode(program, "KindCallExpression", "String.fromCharCode(...tuple)");
  const classification = program.records.selectedCall.get(call);
  const target = classification.target;
  const sequence = target.call.sequenceArguments[0];
  const corruptCall = { ...target.call, sequenceArguments: [{ ...sequence, targetParameterIndex: sequence.targetParameterIndex + 1 }] };
  assert.equal(csharpSelectedTargetArgumentBindings(target.call).kind === "bound", true, "the finalized sequence is bound");
  assert.equal(csharpSelectedTargetArgumentBindings(corruptCall).kind === "inconsistent", true, "the corrupted sequence is inconsistent");
  const corrupt = { ...classification, target: { ...target, call: corruptCall } };
  const operations = { ...program.records, selectedCall: { get: (node) => node === call ? corrupt : program.records.selectedCall.get(node) } };
  let message = "";
  try { collectCsharpNativeUses(ownerInput(program, { operations })); } catch (error) { message = String(error.message); }
  assert.equal(message.includes("disagrees with its finalized parameter binding"), true, "the owner raises the internal invariant");
});

test("each call route keeps its runtime children and publishes its planning recipe over the same sites", () => {
  const program = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
    function take(value: int32): int32 { return value; }
    function factory(): (value: int32) => int32 { return take; }
    function operand(): int32 { return 1 as int32; }
    class Box { run(value: int32): int32 { return value; } }
    function make(): Box { return new Box(); }
    function name(): "run" { return "run"; }
    export function run(list: List<int32>): int32 {
      list.Add(operand());
      return factory()(operand()) + make().run(operand()) + make()[name()](operand());
    }
  ` }).result.program;
  const uses = analyzeCsharpNativeDemand(ownerInput(program)).nativeUse;
  const entries = collectCsharpNativeUses(ownerInput(program));
  const runtime = (call) => roles(program, uses, entries.find(({ use }) => use.expression === call).use.children);
  const recipe = (call) => (uses.order(call) ?? []).map((step) => `${step.site.role} ${sourceText(program, uses.get(step.site)?.expression)}`);
  const argument = "argument:source=0:effective=0:parameter=0 operand()";
  for (const [text, head, planningHead] of [
    ["factory()(operand())", ["callee factory()"], ["callee factory()"]],
    ["make().run(operand())", ["receiver make()"], ["receiver make()"]],
    ["make()[name()](operand())", ["receiver make()", "key name()"], ["key name()", "receiver make()"]],
    ["list.Add(operand())", ["receiver list"], ["receiver list"]],
  ]) {
    const call = findNode(program, "KindCallExpression", text);
    assert.equal(JSON.stringify(runtime(call)) === JSON.stringify([...head, argument]), true, `${text}: runtime ${runtime(call).join(", ")}`);
    assert.equal(JSON.stringify(recipe(call)) === JSON.stringify([argument, ...planningHead]), true, `${text}: recipe ${recipe(call).join(", ")}`);
  }
});

test("an object literal's recipe visits each member once in member order, methods included", () => {
  const program = compileCsharpSource({ surface: "js", sourceText: `
    function value(input: number): number { return input; }
    export function make(): number {
      const made = { first: value(1), method(): number { return value(2); }, last: value(3) };
      return made.first + made.last + made.method();
    }
  ` }).result.program;
  const uses = analyzeCsharpNativeDemand(ownerInput(program)).nativeUse;
  const literal = findNode(program, "KindObjectLiteralExpression", "{ first: value(1), method(): number { return value(2); }, last: value(3) }");
  const order = plannedOrder(program, uses, indexFile(program));
  const start = order.indexOf("use initializer { first: value(1), method(): number { return value(2); }, last: value(3) }");
  const members = order.slice(start + 1).filter((entry) => /^use (member:\d+|return) value\(\d\)$/.test(entry)).slice(0, 3);
  assert.equal(JSON.stringify(members) === JSON.stringify(["use member:0 value(1)", "use return value(2)", "use member:2 value(3)"]), true,
    `member order: ${members.join("; ")}`);
  for (const text of ["value(1)", "value(2)", "value(3)"]) {
    assert.equal(order.filter((entry) => entry.endsWith(` ${text}`)).length === 1, true, `${text} is visited once`);
  }
  const children = collectCsharpNativeUses(ownerInput(program)).find(({ use }) => use.expression === literal).use.children;
  assert.equal(JSON.stringify(roles(program, uses, children)) === JSON.stringify(["member:0 value(1)", "member:2 value(3)"]), true,
    "the runtime children keep only the property values");
});

test("a literal switch case stays a required use, with its completion or as unadmitted", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function classify(value: number): number {
      switch (value) {
        case 1:
          return 10;
        default:
          return 20;
      }
    }
  ` });
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ message }) => message).join("; "));
  assert.equal((compiled.artifacts.get("src/Index.cs") ?? "").includes("case 1:"), true, "the native switch emits the literal case");
  const program = compiled.result.program;
  const literal = findNode(program, "KindNumericLiteral", "1");
  const statement = findNode(program, "KindSwitchStatement", "switch (value) { case 1: return 10; default: return 20; }");
  const uses = analyzeCsharpNativeDemand(ownerInput(program)).nativeUse;
  const caseStep = (uses.order(statement) ?? []).find((step) => step.kind === "use" && step.site.role === "case:0");
  const caseUse = caseStep === undefined ? undefined : uses.get(caseStep.site);
  assert.equal(caseUse?.expression === literal && caseUse.kind === "value" && caseUse.completion.kind === "value", true,
    "the case literal is a value use with its completion");
  const valueReads = { valueRead: { get: (node) => node === literal ? undefined : program.records.valueRead.get(node) } };
  const missing = analyzeCsharpNativeDemand(ownerInput(program, { valueReads }));
  const missingStep = (missing.nativeUse.order(statement) ?? []).find((step) => step.kind === "use" && step.site.role === "case:0");
  assert.equal(missingStep !== undefined && missing.nativeUse.get(missingStep.site) === undefined, true,
    "without a completion the case site stays in the switch's order");
  assert.equal(missing.unadmitted.some((entry) => entry.expression === literal && entry.reason === "completion-unresolved"), true,
    "and is reported as unadmitted rather than erased");
});

test("a field descriptor omits only its initializer; attributes and ordinary initializers stay", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute, field } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    function sentinel(value: int32): int32 { return value; }
    export class Api {
      value = field<int32>();
      declare described: int32;
      other: int32 = sentinel(1 as int32);
    }
    attribute<Api>().property(api => api.value).add(() => new ObsoleteAttribute("field"));
  ` });
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ message }) => message).join("; "));
  const program = compiled.result.program;
  const uses = analyzeCsharpNativeDemand(ownerInput(program)).nativeUse;
  const order = plannedOrder(program, uses, indexFile(program));
  assert.equal(order.some((entry) => entry.includes("field<int32>()")), false, "the descriptor's marker is not a native use");
  assert.equal(order.includes("use initializer sentinel(1 as int32)"), true, "an ordinary initializer stays a use");
  assert.equal(order.includes("use attribute-invocation:0 new ObsoleteAttribute(\"field\")"), true, "the descriptor field keeps its attribute");
  assert.equal(order.filter((entry) => entry === "construct KindPropertyDeclaration").length === 2, true,
    "the type-only field is not a member construct; the descriptor and ordinary fields are");
});
