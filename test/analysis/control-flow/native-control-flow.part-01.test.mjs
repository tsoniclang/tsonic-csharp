import assert from "node:assert/strict";
import test from "node:test";
import { nativeFinallyOverrideSource } from "../../../../tsonic/test/fixtures/native-completion-regions.mjs";
import { compileCsharpSource, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { admitCsharpNativeDeclarations } from "../../../dist/analysis/declarations/native-value-declarations.js";
import { admitCsharpNativeStorageBindings, admitCsharpStatementBindings } from "../../../dist/analysis/control-flow/native-control-flow.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { planPropertyDeclaration } from "../../../dist/backend/planner/declarations/classes/properties.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpTypeForExpressionCarrier, planBindingPatternFromExpression } from "../../../dist/backend/planner/bindings/binding-patterns.js";
import { createDestructuringPlannerState } from "../../../dist/backend/planner/bindings/binding-state.js";
import { planCsharpGeneratedMethodCall } from "../../../dist/backend/planner/declarations/generated-methods.js";
import { planBreakStatement, planContinueStatement, planReturnStatement } from "../../../dist/backend/planner/statements/statement-simple.js";
import { planLocalDeclarationStatements } from "../../../dist/backend/planner/bindings/locals.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/render.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`native C# rejects control transfer leaving cleanup before publishing output in ${surface}`, () => {
    for (const sourceText of [nativeFinallyOverrideSource,
      "export function run(): void { while (true) { try {} finally { break; } } }",
      "export function run(): void { while (true) { try {} finally { continue; } } }"]) {
      const compiled = compileCsharpSource({ surface, sourceText });
      assert.equal(compiled.result.diagnostics.some(row => row.code === "CSHARP_NATIVE_FINALLY_CONTROL_TRANSFER"), true,
        "native cleanup transfer prohibition must be diagnosed at analysis");
      assert.equal(compiled.artifacts.size, 0, "invalid native control flow must not publish partial artifacts");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
        "cleanup transfer rejection precedes successful record publication and planning");
    }
  });
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`destructuring sources have exact final native renderability before publication on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function run(): number {
        const source: [number] = [7];
        const [value] = source;
        let assigned = 0;
        [assigned] = source;
        return value + assigned;
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "both source forms are checked native bindings");
    assert.equal(compiled.targetDiagnostics.length, 0, "both final native sources are admitted");
    const program = compiled.result.program;
    const ast = program.source.ast;
    const forms = [];
    const visit = node => {
      if (ast.is.IsVariableDeclaration(node)) {
        const declaration = ast.as.AsVariableDeclaration(node);
        if (ast.is.IsArrayBindingPattern(declaration.name)) forms.push({ node, source: declaration.Initializer,
          subject: declaration.name, description: "Destructuring source expression" });
      } else if (ast.is.IsBinaryExpression(node)) {
        const assignment = ast.as.AsBinaryExpression(node);
        if (ast.is.IsArrayLiteralExpression(assignment.Left)) forms.push({ node, source: assignment.Right,
          subject: assignment.Left, description: "Destructuring assignment source" });
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(forms.length, 2, "declaration and assignment sources are both covered");
    for (const form of forms) {
      const original = program.records.nativeExpression.get(form.source);
      assert.equal(original !== undefined, true, `${form.description}: exact final native use exists`);
      // The published expression record of the source, with a corrupted native completion.
      const corrupted = { ...original, use: { ...original.use,
        completion: { kind: "value", type: { kind: "opaque", id: "corrupted-native-source" } } } };
      const nativeExpression = { get: node => node !== form.source ? program.records.nativeExpression.get(node) : corrupted };
      // The pre-seal admission reads the native-use classification; rebuild it over the published use records.
      const nativeUse = { get: site => program.records.nativeUse.get(site), order: node => program.records.nativeOrder.get(node),
        expression: node => nativeExpression.get(node) };
      const issues = admitCsharpNativeStorageBindings(ast, [form.node], nativeUse, program.records,
        program.records.nativeRefReturn, program.records.nativeParticipation,
        program.records.compileTimeMetadata, program.records.nativeUnreachable);
      assert.equal(issues.length, 1, `${form.description}: one pre-seal refusal owner`);
      assert.equal(issues[0].sourceNode === form.subject, true, `${form.description}: original source subject`);
      assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", `${form.description}: original refusal code`);
      assert.equal(issues[0].message, `${form.description} requires its admitted native source carrier before C# emission.`,
        `${form.description}: original refusal message`);
      const diagnostics = [];
      const input = createCsharpPlanningContext({ ...program, records: { ...program.records, nativeExpression } });
      assert.throws(() => getCsharpTypeForExpressionCarrier(form.source, input, diagnostics, form.subject, form.description),
        error => error.message.includes("admitted native source carrier rendering"),
        `${form.description}: bypassing admission is a separate renderer invariant`);
      assert.equal(diagnostics.length, 0, `${form.description}: the renderer repeats no source diagnostic`);
    }
  });
}

test("generator return renders the native function's already selected return syntax", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function* values(): Generator<number, void, unknown> { yield 1; return; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the generator is checked native source");
  assert.equal(compiled.targetDiagnostics.length, 0, "the native protocol is admitted");
  const program = compiled.result.program;
  const ast = program.source.ast;
  const declaration = csharpProgramSourceFiles(program).flatMap(file => ast.statements(file))
    .find(node => node !== undefined && ast.is.IsFunctionDeclaration(node));
  const statement = ast.children(ast.body(declaration))
    .find(node => node !== undefined && ast.is.IsReturnStatement(node));
  const context = createCsharpPlanningContext(program);
  const protocol = program.records.generator.get(declaration);
  assert.equal(protocol !== undefined && statement !== undefined, true,
    "the real published generator supplies the exact return statement and native protocol");
  const type = csharpTypeFromTargetTypeRef(protocol.returnType, context.scope.typeParameterNames);
  const state = createDestructuringPlannerState();
  state.generator = { declaration, controllerName: "controller", returnValueName: "returned", exitLabel: "completed", protocol };
  state.currentReturnType = type;
  const diagnostics = [];
  const planned = planReturnStatement(statement, ast.getSourceFile(statement), context, diagnostics, state);
  assert.equal(planned[0]?.kind === "ExpressionStatement" && planned[0].expression?.right?.type === type, true,
    "the default return reuses the exact renderer syntax object, not a second carrier selection");
  assert.equal(diagnostics.length, 0, "an admitted return adds no source decision");
  state.currentReturnType = undefined;
  assert.throws(() => planReturnStatement(statement, ast.getSourceFile(statement), context, diagnostics, state),
    error => error.message.includes("already rendered return type"),
    "only a deliberately missing established function context reaches the invariant");
  assert.equal(diagnostics.length, 0, "context corruption never becomes a second source refusal");
});

test("checked-source admission excludes malformed binding and control-flow grammar before planning", () => {
  for (const control of [
    { label: "uninitialized destructuring", sourceText: "export function run(): void { let { value }: { value: number }; }" },
    { label: "multiple for-of declarations", sourceText: "export function run(): void { for (let first, second of [1]) {} }" },
    { label: "initialized for-of declaration", sourceText: "export function run(): void { for (let value = 1 of [1]) {} }" },
    { label: "missing condition", sourceText: "export function run(): void { if () {} }" },
    { label: "missing setter parameter", sourceText: "export class View { set value() {} }" },
    { label: "multiple setter parameters", sourceText: "export class View { set value(first: number, second: number) {} }" },
    { label: "multiple index signature keys", sourceText: "export interface View { [first: string, second: string]: number; }" },
    { label: "interface property initializer", sourceText: "export interface View { value: number = 1; }" },
    { label: "unbound break label", sourceText: "export function run(): void { while (true) { break missing; } }" },
    { label: "unbound continue label", sourceText: "export function run(): void { while (true) { continue missing; } }" },
    { label: "continue to a non-iteration label", sourceText: "export function run(): void { target: { continue target; } }" },
  ]) {
    const compiled = compileCsharpSource({ sourceText: control.sourceText });
    assert.equal(compiled.sourceDiagnosticsText.length > 0, true, `${control.label}: checked syntax is refused`);
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      `${control.label}: malformed grammar never reaches native planning`);
    assert.equal(compiled.artifacts.size, 0, `${control.label}: malformed grammar never emits native artifacts`);
  }
});

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`checked source labels use native synthetic endpoints without spelling constraints on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function run(): int {
        let result: int = 0;
        event: while (true) { result += 1; break event; }
        $done: { result += 1; break $done; }
        outer: inner: for (let index: int = 0; index < 3; index++) {
          if (index === 1) continue outer;
          result += 1;
        }
        return result;
      }
      export function other(): int { event: while (true) { break event; } return 5; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "all source labels have exact checked break/continue targets");
    assert.equal(compiled.targetDiagnostics.length, 0, "native synthetic endpoints impose no authored identifier restriction");
    const output = compiled.artifacts.get("src/Index.cs");
    // Generated endpoints carry the authored label as an identifier fragment (RULINGS 2026-10-22): any spelling compiles.
    assert.doesNotMatch(output, /__tsonic_label_(?:@|\$)/u, "authored labels are spelled as identifier fragments, never raw");
    assert.match(output, /goto __tsonic_label_event_break\d+;/u, "checked break targets use deterministic generated names");
    assert.match(output, /goto __tsonic_label_x0024done_break\d+;/u, "non-identifier label characters are spelled as code units");
    assert.match(output, /goto __tsonic_label_inner_continue\d+;/u, "nested checked continue targets retain the selected loop");
    executeCsharpConstruction(compiled, `native-control-labels-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 4 || Tsonic.Generated.Index.other() != 5)
    throw new System.Exception("native checked label identity");
`);
  });
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`local enum refusal belongs to declaration admission on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function run(): void { enum Value { first = 1 } let value: Value = Value.first; void value; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the local enum is checked source");
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "the existing refusal has one admission owner");
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "the original code is preserved");
    assert.equal(issues[0].message, "Statement is outside the current C# planning surface.", "the original reason is preserved");
    assert.equal(createTargetSourceProgram(compiled.source).ast.is.IsEnumDeclaration(issues[0].sourceNode), true,
      "the diagnostic keeps the same declaration node");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "the refusal precedes record publication, planning and artifacts");
  });

test(`interface and abstract destructuring signatures are native data-only contracts on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export interface Contract { accept([value]: [number]): number; }
      export abstract class Base implements Contract { abstract accept([value]: [number]): number; }
      class Implementation extends Base { accept([value]: [number]): number { return value + 1; } }
      function call(value: Contract): number { return value.accept([6]); }
      export function run(): number { return call(new Implementation()); }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "body-less and implementing signatures agree in checked source");
    assert.equal(compiled.targetDiagnostics.length, 0,
      compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
    const output = compiled.artifacts.get("src/Index.cs");
    assert.match(output, /double accept\(System\.ValueTuple<double> __tsonic_param0\)/u,
      "the interface retains the existing abstract native parameter signature");
    executeCsharpConstruction(compiled, `native-data-only-signatures-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 7) throw new System.Exception("native data-only signatures");
`);
  });

test(`local interface statements are refused by declaration admission before publication on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function run(): number {
        interface Value { value: number; }
        const input: Value = { value: 1 };
        return input.value;
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the local interface is checked source, not malformed grammar");
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "one declaration admission owner preserves the original refusal");
    assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "the existing source refusal code is unchanged");
    assert.equal(issues[0].message, "Statement is outside the current C# planning surface.",
      "the existing source refusal reason is unchanged");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "a source refusal never publishes successful records or enters planning");
    assert.equal(compiled.artifacts.size, 0, "a refused local interface cannot emit partial artifacts");
  });

test(`local type declarations in switch clauses are refused before publication on ${surface}`, () => {
    for (const [declaration, kind] of [
      ["interface Value { value: number; }", "KindInterfaceDeclaration"],
      ["enum Value { first = 1 }", "KindEnumDeclaration"],
    ]) {
      const compiled = compileCsharpSource({ surface,
        sourceText: `export function run(value: number): void { switch (value) { case 1: ${declaration} break; } }` });
      assert.equal(compiled.sourceDiagnosticsText, "", "the exact clause declaration is valid checked source");
      const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
      assert.equal(issues.length, 1, "one existing declaration owner retains the original refusal");
      assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "the exact original code is preserved");
      assert.equal(issues[0].message, "Statement is outside the current C# planning surface.",
        "the exact original source reason is preserved");
      const ast = createTargetSourceProgram(compiled.source).ast;
      assert.equal(ast.kindName(issues[0].sourceNode), kind, "the exact local declaration remains the diagnostic node");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
        "a clause declaration refusal precedes successful publication, planning and artifacts");
    }
  });

test(`retained destructuring publishes exact extraction, destination and admitted conversion on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      class View { value: int = 7; }
      export function run(values: int[]): number {
        const { value }: { value: number } = new View();
        const [first, ...rest] = values;
        let assigned: number = 0;
        [assigned] = values;
        return value + first + assigned + rest[0];
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "all extraction and destination types are checked source");
    assert.equal(compiled.targetDiagnostics.length, 0, "all retained projections are admitted before publication");
    const program = compiled.result.program;
    const ast = program.source.ast;
    const projections = [];
    const visit = node => {
      const fact = program.records.bindingPatternProjection.get(node);
      if (fact?.element !== undefined) projections.push({ node, fact });
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(projections.length, 4, "named member, array element, rest and assignment projections are retained");
    for (const { fact } of projections) {
      assert.equal(fact.binding?.source !== undefined && fact.binding.target !== undefined &&
        fact.binding.conversion.kind !== "rejected", true, "the renderer receives one exact physical conversion");
      assert.equal(Object.isFrozen(fact.binding) && Object.isFrozen(fact.binding.conversion), true,
        "selected binding evidence is immutable before planning");
    }
    const first = projections.find(entry => ast.text(entry.fact.binding.node) === "value");
    assert.equal(first !== undefined, true, "the corruption witness keeps the exact authored member binding");
    const pattern = ast.parent(first.node);
    const context = createCsharpPlanningContext(program);
    const corrupted = { ...program, records: { ...program.records,
      bindingPatternProjection: { get: node => node === first.node
        ? { ...first.fact, binding: undefined } : program.records.bindingPatternProjection.get(node) } } };
    const diagnostics = [];
    assert.throws(() => planBindingPatternFromExpression(pattern, { kind: "IdentifierName", name: "source" },
      ast.getSourceFile(pattern), { ...context, program: corrupted }, diagnostics,
      createDestructuringPlannerState(pattern, ast)),
    error => error.message.includes("An admitted binding projection requires its exact extraction, destination and conversion."),
    "only corrupted successful producer evidence reaches the invariant");
    assert.equal(diagnostics.length, 0, "the planner does not invent a second source refusal");
    const values = surface === "js" ? "new global::Tsonic.CSharp.Js.JSArray<int>(new int[] { 1, 2, 3 })"
      : "new int[] { 1, 2, 3 }";
    executeCsharpConstruction(compiled, `admitted-destructuring-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run(${values}) != 11) throw new System.Exception("native binding projection");
`);
  });
}

test("checked labeled transfers require their exact active renderer target", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(stop: boolean): void {
      outer: while (true) { if (stop) break outer; continue outer; }
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "both transfers have checked source targets");
  assert.equal(compiled.targetDiagnostics.length, 0, "the unmodified native label producer renders both transfers");
  const program = compiled.result.program;
  const ast = program.source.ast;
  const transfers = [];
  const visit = node => {
    if (ast.is.IsBreakStatement(node) || ast.is.IsContinueStatement(node)) transfers.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  assert.equal(transfers.length, 2, "the witness retains one break and one continue");
  for (const transfer of transfers) {
    const diagnostics = [];
    const render = ast.is.IsBreakStatement(transfer) ? planBreakStatement : planContinueStatement;
    const message = ast.is.IsBreakStatement(transfer)
      ? "A checked labeled break lost its active native label target."
      : "A checked labeled continue lost its active native iteration target.";
    assert.throws(() => render(transfer, createCsharpPlanningContext(program), diagnostics, createDestructuringPlannerState()),
      error => error.message.includes(message), "only a deliberately missing active renderer stack reaches the invariant");
    assert.equal(diagnostics.length, 0, "invalid renderer state does not relabel a source program as unsupported");
  }
});

test("generated native helpers require their constructed scope and paired parameter contract", () => {
  const compiled = compileCsharpSource({ sourceText: "export function run(): number { return 1; }" });
  assert.equal(compiled.targetDiagnostics.length, 0, "the helper corruption witness starts from a valid published program");
  const program = compiled.result.program;
  const ast = program.source.ast;
  const node = csharpProgramSourceFiles(program).flatMap(file => ast.statements(file)).find(statement => ast.is.IsFunctionDeclaration(statement));
  const context = createCsharpPlanningContext(program);
  for (const control of [
    { name: "missing containing native type", input: context, parameters: [] },
    { name: "mismatched constructed argument list", input: { ...context,
      scope: { ...context.scope, generatedMethods: new Map() } },
      parameters: [{ name: "value", type: { kind: "PredefinedType", name: "double" } }] },
  ]) {
    const diagnostics = [];
    assert.throws(() => planCsharpGeneratedMethodCall(node, "corrupted", { kind: "PredefinedType", name: "double" },
      control.parameters, { kind: "Block", statements: [] }, [], control.input, diagnostics),
    error => error.message.includes("A generated native method lost its containing scope or exact constructed argument contract."),
    control.name);
    assert.equal(diagnostics.length, 0, `${control.name}: impossible renderer input is not a source refusal`);
  }
});

test("every emitted class property has one selected physical storage record", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class View { value: number = 1; readonly count: number = 2; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "property source is checked");
  assert.equal(compiled.targetDiagnostics.length, 0, "native class property selection succeeds");
  const program = compiled.result.program;
  const ast = program.source.ast;
  const declaration = csharpProgramSourceFiles(program).flatMap(file => ast.statements(file))
    .find(node => node !== undefined && ast.is.IsClassDeclaration(node) && ast.text(ast.name(node)) === "View");
  const properties = ast.members(declaration).filter(node => node !== undefined && ast.is.IsPropertyDeclaration(node));
  assert.equal(properties.length, 2, "both native fields retain their original declarations");
  const context = createCsharpPlanningContext(program);
  for (const property of properties) {
    assert.equal(program.records.classPropertyStorage.get(property)?.kind, "field",
      "the single class-property producer records each exact field");
    const corrupted = { ...program, records: { ...program.records,
      classPropertyStorage: { get: () => undefined } } };
    const diagnostics = [];
    assert.throws(() => planPropertyDeclaration(property, ast.getSourceFile(property),
      { ...context, program: corrupted }, diagnostics, undefined),
    error => error.message.includes("A checked class property lost its selected native field or property storage."),
    "only deliberately corrupted admitted storage reaches the planner invariant");
    assert.equal(diagnostics.length, 0, "internal storage corruption is never relabelled as a source refusal");
  }
});

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`admitted constant switch labels remain direct native syntax on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function run(value: int): int {
        switch (value) { case 1: return 2; case 3: return 4; default: return 0; }
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "native switch source is checked");
    assert.equal(compiled.targetDiagnostics.length, 0, "native switch admission retains valid constant labels");
    const output = compiled.artifacts.get("src/Index.cs");
    assert.match(output, /switch \(value\)/u, "the native switch is not replaced by a runtime dispatcher");
    assert.match(output, /case 1:/u, "the first literal remains a native constant label");
    assert.match(output, /case 3:/u, "the second literal remains a native constant label");
  });
}

for (const declarationKind of Array.from(["interface", "class"]).slice(0, 2)) {
test(`${declarationKind} native heritage renderability is refused by its owner before publication`, () => {
  const checked = checkCsharpSource({ sourceText: `export ${declarationKind} View { value: number${declarationKind === "class" ? " = 1" : ""}; }` });
  assert.equal(checked.sourceDiagnosticsText, "", "the admission witness has valid native source");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const declaration = source.navigation.sourceFiles.flatMap(file => ast.statements(file))
    .find(node => node !== undefined && (ast.is.IsInterfaceDeclaration(node) || ast.is.IsClassDeclaration(node)) &&
      ast.text(ast.name(node)) === "View");
  assert.equal(declaration !== undefined, true, "the checked interface is present");
  const issues = admitCsharpNativeDeclarations(ast, [declaration], { order: () => [] },
    { heritageForDeclaration: () => ({ interfaces: [{ kind: "opaque", id: "missing" }] }) },
    source.navigation,
    { compileTimeMetadata: { get: () => false }, sourceField: { get: () => undefined } },
    { storageType: { get: () => ({ kind: "source-primitive", name: "float64" }) } },
    { get: () => undefined }, { get: () => false },
    { methodWrite: { get: () => undefined }, returnContract: { get: () => undefined } },
    { get: () => undefined }, { get: () => undefined },
    { captureFrame: { get: () => undefined }, capturedBinding: { get: () => undefined },
      physicalStorageType: { get: (_node, type) => type } });
  assert.equal(issues.length, 1, "one pre-seal declaration owner refuses the native carrier");
  assert.equal(issues[0]?.code, "CSHARP_UNSUPPORTED_AST", "the original refusal code is retained");
  assert.equal(issues[0]?.message, "Canonical project heritage contains a target type that cannot be rendered in C#.",
    "the original refusal message is retained");
  assert.equal(issues[0]?.sourceNode === declaration, true, "the refusal stays on its exact source declaration");
});
}

test("declaration admission consumes exact retained masks, not empty construction order guesses", () => {
  const checked = checkCsharpSource({ sourceText: "export class View {}" });
  assert.equal(checked.sourceDiagnosticsText, "", "the empty native class is valid");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const declaration = source.navigation.sourceFiles.flatMap(file => ast.statements(file))
    .find(node => node !== undefined && ast.is.IsClassDeclaration(node));
  for (const control of [
    { label: "retained empty class", participation: undefined, metadata: false, unreachable: false, count: 1 },
    { label: "erased participation", participation: "erased", metadata: false, unreachable: false, count: 0 },
    { label: "compile-time metadata", participation: undefined, metadata: true, unreachable: false, count: 0 },
    { label: "native unreachable", participation: undefined, metadata: false, unreachable: true, count: 0 },
  ]) {
    const issues = admitCsharpNativeDeclarations(ast, [declaration], { order: () => [] },
      { heritageForDeclaration: () => ({ interfaces: [{ kind: "opaque", id: "missing" }] }) },
      source.navigation,
      { compileTimeMetadata: { get: () => control.metadata }, sourceField: { get: () => undefined } },
      { storageType: { get: () => ({ kind: "source-primitive", name: "float64" }) } },
      { get: () => control.participation }, { get: () => control.unreachable },
      { methodWrite: { get: () => undefined }, returnContract: { get: () => undefined } },
      { get: () => undefined }, { get: () => undefined },
      { captureFrame: { get: () => undefined }, capturedBinding: { get: () => undefined },
        physicalStorageType: { get: (_node, type) => type } });
    assert.equal(issues.length, control.count, `${control.label}: only final producer masks decide participation`);
  }
});

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
test(`declaration source refusals publish neither records nor artifacts on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: "export class View { static value: string; }" });
    assert.equal(compiled.sourceDiagnosticsText, "", "the declared non-nullable field is checked source");
    assert.equal(compiled.targetDiagnostics.length, 1, "one declaration owner refuses the incompatible native default");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_STATIC_FIELD_INITIALIZER_REQUIRED",
      "the declaration admission owner reports its precise source constraint");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "the declaration refusal happens before publication, not in the renderer");
    assert.equal(compiled.artifacts.size, 0, "the same declaration owner cannot publish partial artifacts");
  });

test(`runtime-shape modifier refusals have one pre-seal declaration owner on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: "export class View { accessor value: number = 1; }" });
    assert.equal(compiled.sourceDiagnosticsText, "", "the auto-accessor is valid checked TypeScript");
    assert.equal(compiled.targetDiagnostics.length, 1, "the source modifier is refused exactly once");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_UNSUPPORTED_AST", "the original source code is retained");
    assert.equal(compiled.targetDiagnostics[0].message,
      "TypeScript-only modifier 'accessor' on property declaration is outside the native runtime-shape source subset. Use standard ECMAScript runtime shape or target/provider facts instead.",
      "the original role and message are retained");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "modifier selection is complete before the native program is sealed");
    assert.equal(compiled.artifacts.size, 0, "no rejected modifier reaches C# emission");
  });

test(`for-of declarations, assignment destinations and string iteration use admitted physical bindings on ${surface}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { int } from "@tsonic/csharp/types.js";
        export function sum(values: int[]): number {
          let current: number = 0;
          let total: number = 0;
          for (current of values) total += current;
          return total;
        }
        export function joined(values: string[]): string {
          let text = "";
          for (const value of values) text += value;
          return text;
        }
        export function characters(value: string): string {
          let text = "";
          for (const character of value) text += character;
          return text;
        }
      ` });
      assert.equal(compiled.sourceDiagnosticsText, "", "native loop source is checked");
      assert.equal(compiled.targetDiagnostics.length, 0, "native binding conversions are admitted once");
      const program = compiled.result.program;
      const ast = program.source.ast;
      let count = 0;
      const visit = node => {
        if (ast.is.IsForOfStatement(node)) {
          count += 1;
          const iteration = program.records.iteration.get(node);
          assert.equal(iteration?.kind === "resolved" && iteration.iterationKind === "for-of", true,
            "every retained loop has its successful native selection");
          assert.equal(iteration.binding.storageType !== undefined && iteration.binding.conversion !== undefined, true,
            "the planner never arbitrates storage or reselects a conversion");
          assert.equal(Object.isFrozen(iteration.binding), true, "the binding is immutable at publication");
        }
        ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      csharpProgramSourceFiles(program).forEach(visit);
      assert.equal(count, 3, "all three physical binding forms are witnessed");
      const integers = surface === "js"
        ? "new global::Tsonic.CSharp.Js.JSArray<int>(new int[] { 1, 2, 3 })" : "new int[] { 1, 2, 3 }";
      const strings = surface === "js"
        ? "new global::Tsonic.CSharp.Js.JSArray<string>(new string[] { \"a\", \"b\" })" : "new string[] { \"a\", \"b\" }";
      executeCsharpConstruction(compiled, `admitted-for-of-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.sum(${integers}) != 6 ||
    Tsonic.Generated.Index.joined(${strings}) != "ab" ||
    Tsonic.Generated.Index.characters("a😀b") != "a😀b")
    throw new System.Exception("native admitted iteration bindings");
`);
    });
}
