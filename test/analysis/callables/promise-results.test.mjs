import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramPromiseResults } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpGenericAdoption, analyzeCsharpPromiseResults } from "../../../dist/analysis/callables/async/promise-results.js";
import { createTargetSourceProgram } from "../../../../tsonic/packages/target-api/dist/public/source.js";
import { createSourceDeclarationOwnershipBudget, defaultSourceDeclarationOwnershipLimits } from "../../../../tsonic/packages/target-api/dist/public/analysis.js";
import { localFiniteAwaitBranches } from "../../../../tsonic/test/fixtures/local-finite-await-branches.mjs";
import { nativeDefiniteCompletionSource } from "../../../../tsonic/test/fixtures/native-completion-regions.mjs";
import { nativeErrorTransportCases } from "../../../../tsonic/test/fixtures/native-error-transport.mjs";

for (const [name, statement, discarded] of [
  ["discarded", "leaf();", 1],
  ["void", "void leaf();", 1],
  ["conditional", "flag ? leaf() : leaf();", 2],
  ["stored", "const pending = leaf(); return await pending;", 0],
  ["awaited", "return await leaf();", 0],
]) {
  test(`C# publishes the selected Promise result use: ${name}`, () => {
    // Executable output: its startup record carries the selected binary execution driver (a library has none).
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
      async function leaf(): Promise<number> { return 1; }
      export async function outer(flag: boolean): Promise<number> { ${statement} return 0; }
    ` });
    assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`), []);
    const results = csharpProgramPromiseResults(compiled.result.program);
    assert.equal(results.length > 0, true, "the result-use owner publishes the decisions");
    assert.equal(results.filter(row => row.discard !== undefined).length, discarded);
    if (discarded > 0) assert.equal(compiled.result.program.records.startup.get().driver?.id, "tsonic.csharp.js.event-loop-v1");
    for (const row of results) assert.equal(Object.isFrozen(row), true);
  });
}

test("C# publishes a native eager Task discard without rejection observation", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ targetOptions: { outputType: "Exe" }, sourceText: `
    let starts = 0;
    async function leaf(): Promise<number> { starts += 1; return 1; }
    export function outer(): void { leaf(); }
    outer();
    if (starts !== 1) throw new Error("native eager Task body");
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the exact native discard is checked source");
  assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => diagnostic.code), []);
  assert.equal(compiled.result.program !== undefined, true, "native eager result dropping is admitted before publication");
  const results = csharpProgramPromiseResults(compiled.result.program);
  assert.equal(results.filter(row => row.disposition.kind === "discarded").length, 1, "the actual call has one native discard");
  assert.equal(results.every(row => row.discard === undefined), true, "native discard never claims to observe rejection");
  assert.equal(compiled.result.program.records.startup.get().driver === undefined, true, "native Task drop needs no JS loop owner");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /_ = global::Tsonic\.Generated\.Index\.leaf\(\)/u);
  assert.doesNotMatch(output, /ObserveDiscarded|PromiseRuntime|Task\.Run|Wait\(|\.Result\b/u);
  executeCsharpConstruction(compiled, "native-task-drop-no-loop");
});

for (const [name, sourceText, surface, outputType] of [
  ["finite-width", localFiniteAwaitBranches, "js", "Library"],
  ["definite-local", nativeDefiniteCompletionSource, "native", "Library"],
  ["object-method", nativeErrorTransportCases.find(([name]) => name === "async-object-unit")[1], "js", "Exe"],
]) {
  test(`C# native continuation reads retain their exact original source: ${name}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText, targetOptions: { outputType } });
    const { ast } = compiled.source;
    const issues = compiled.result.diagnostics.map(issue => {
      const node = issue.sourceNode;
      const file = node === undefined ? undefined : ast.getSourceFile(node);
      return { code: issue.code, message: issue.message,
        kind: node === undefined ? undefined : ast.kindName(node),
        start: node === undefined ? undefined : ast.pos(node),
        text: file === undefined ? undefined : ast.getSourceText(file).slice(ast.pos(node), ast.end(node)) };
    });
    assert.equal(compiled.sourceDiagnosticsText, "", name);
    assert.deepEqual(issues, [], name);
    assert.equal(compiled.result.program !== undefined, true, name);
  });
}

function nativeReadFixture() {
  const compiled = compileCsharpSource({ sourceText: `
    async function pause(): Promise<void> {}
    function read(value: number): number { return value; }
    export async function round(value: number): Promise<number> {
      await pause();
      return read(value);
    }
    export function invoke(value: number): Promise<number> { return round(value); }
  ` });
  assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })), []);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the checked native read fixture completes");
  const { source, records } = program;
  const nodes = source.navigation.nodesForFiles(source.sourceFiles);
  const call = nodes.find(node => source.ast.is.IsCallExpression(node) &&
    source.ast.text(source.ast.as.AsCallExpression(node).Expression) === "read");
  assert.equal(call !== undefined, true, "the original checked read call exists");
  const reference = source.ast.arguments(call)[0];
  assert.equal(reference !== undefined && source.ast.is.IsIdentifier(reference), true, "the actual runtime argument is retained");
  const nativeUse = Object.freeze({ get: records.nativeUse.get, order: records.nativeOrder.get,
    expression(node) { const selected = records.nativeExpression.get(node); return selected === undefined ? undefined
      : { site: selected.site, use: selected.use }; } });
  return { program, nodes, call, reference, input: { source, projectRoot: "/project", nodes,
    records: { valueRead: records.valueRead, storageType: records.storageType, nativeUse,
      selectedCall: records.selectedCall, selectedConstruction: records.selectedConstruction },
    definitions: program.typeDefinitions, nativePlacement: [] } };
}

test("C# continuation retention consumes completed native reads rather than incomplete syntax stages", () => {
  const current = nativeReadFixture();
  const { records } = current.input;
  const callee = current.program.source.ast.as.AsCallExpression(current.call).Expression;
  assert.equal(records.selectedCall.get(current.call).sourceCall.kind, "function", "exact selected static declaration");
  assert.equal(records.nativeUse.expression(callee) === undefined, true, "a static method group has no runtime callee storage");
  const native = records.nativeUse.expression(current.reference)?.use;
  assert.equal(native !== undefined && native.kind !== "erased" && native.completion.kind === "value", true,
    "the real suspended input has completed native storage");
  const result = analyzeCsharpPromiseResults({ ...current.input, records: { ...records,
    valueRead: { get: node => node === current.reference ? undefined : records.valueRead.get(node) } } });
  assert.deepEqual(result.diagnostics.map(({ code, message }) => ({ code, message })), []);
});

test("C# continuation retention never discharges a missing real native read as an empty continuation", () => {
  const current = nativeReadFixture();
  const { records } = current.input;
  const result = analyzeCsharpPromiseResults({ ...current.input, records: { ...records,
    valueRead: { get: node => node === current.reference ? undefined : records.valueRead.get(node) },
    storageType: { get: node => node === current.reference ? undefined : records.storageType.get(node) },
    nativeUse: { ...records.nativeUse,
      expression: node => node === current.reference ? undefined : records.nativeUse.expression(node) } } });
  assert.equal(result.diagnostics.length, 1, "one exact missing native read remains unresolved");
  assert.equal(result.diagnostics[0].code, "CSHARP_ASYNC_RESULT_USE_NOT_PROVEN");
  assert.equal(result.diagnostics[0].sourceNode === current.reference, true, "the original read is the rejected subject");
  assert.match(result.diagnostics[0].message, /completed native CLR placement and carrier/u);
  const invocation = current.nodes.find(node => current.program.source.ast.is.IsCallExpression(node) &&
    current.program.source.ast.text(current.program.source.ast.as.AsCallExpression(node).Expression) === "round");
  assert.equal(invocation !== undefined, true, "the original async continuation is requested");
  assert.equal(result.results.has(invocation), false, "unresolved completion is never published as success");
});

test("C# transports the exact local generic await diagnostic and annotation hint", () => {
  const checked = checkCsharpSource({ sourceText: `
    export async function needs<T>(x: T): Promise<T> { return await x; }
  ` });
  assert.equal(checked.sourceDiagnosticsText, "", "the F4 program is checked source");
  const source = createTargetSourceProgram(checked.source);
  const nodes = source.navigation.nodesForFiles(source.sourceFiles);
  const root = source.sourceFiles[0];
  const diagnostics = analyzeCsharpGenericAdoption({ source, projectRoot: "/project", nodes,
    budget: createSourceDeclarationOwnershipBudget(root, defaultSourceDeclarationOwnershipLimits),
    premises: { completionFor() { throw new Error("F4 has no call or missing native completion to invent"); } } });
  assert.equal(diagnostics.length, 1, "only the local used bare-T await is refused");
  const diagnostic = diagnostics[0];
  assert.equal(diagnostic.code, "TSONIC_GENERIC_ASYNC_ADOPTION_UNSUPPORTED");
  assert.equal(diagnostic.message,
    "await of a value typed by the type parameter 'T' needs its Promise form declared. Declare it as 'x: T | Promise<T>'.");
  assert.equal(source.ast.is.IsAwaitExpression(diagnostic.sourceNode), true, "the original await owns the diagnostic");
  assert.equal(diagnostic.sourceSpan.fileName, "index.ts");
  assert.equal(diagnostic.evidence.length, 2, "the actual declaration and await retain their evidence");
});
