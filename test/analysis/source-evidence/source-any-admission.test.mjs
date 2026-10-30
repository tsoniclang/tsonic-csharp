import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDiagnosticSpanReader, createTargetSourceProgram } from "@tsonic/target-api/source";
import { finalizeTargetDiagnostics } from "../../../../tsonic/packages/host/dist/diagnostics.js";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { analyzeCsharpSourceAnyAdmission } from "../../../dist/analysis/source-evidence/source-any-admission.js";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

function assertAnyRefusal(compiled) {
  assertCsharpCheckingSucceeded(compiled);
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1, "one checked occurrence refuses admission before native analysis");
  const issue = issues[0];
  assert.equal(issue.code, "TSONIC_ANY_UNSUPPORTED");
  assert.equal(issue.message, "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
  const ast = compiled.source.ast;
  const sourceFile = ast.getSourceFile(issue.sourceNode);
  const queries = compiled.source.getSourceFileQueries(sourceFile);
  const checkedType = ast.is.IsKeywordTypeNode(issue.sourceNode) || ast.is.IsTypeReferenceNode(issue.sourceNode)
    ? queries.checker.getTypeFromTypeNode(issue.sourceNode) : queries.checker.getTypeAtLocation(issue.sourceNode);
  assert.equal(checkedType !== undefined && queries.typeShape.isAny(checkedType), true,
    "the diagnostic retains an actual checked any occurrence, not a guessed native type");
  const span = createSourceDiagnosticSpanReader(ast)(sourceFile, ast.pos(issue.sourceNode), ast.end(issue.sourceNode));
  assert.equal(span !== undefined, true, "the checked project occurrence has an authored span");
  const finalized = finalizeTargetDiagnostics(compiled.source, [issue], "/project")[0];
  assert.deepEqual(finalized.sourceSpan, { ...span, fileName: "index.ts" });
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "source-any admission never publishes a partial native program");
}

for (const surface of ["native", "js"]) {
  for (const [name, sourceText] of [
    ["unused declared value", "export const value: any = 7;"],
    ["parameter", "export function read(value: any): unknown { return value; }"],
    ["return", "export function read(): any { return 7; }"],
    ["alias", "type Value = any; export const value: Value = 7;"],
    ["member", "export interface Holder { value: any; }"],
    ["assertion", "export function read(): unknown { return 7 as any; }"],
    ["union", "export type Value = string | any;"],
    ["generic argument", "export type Values = Array<any>;"],
  ]) test(`canonical source-any admission refuses the checked ${name} on ${surface}`, () => {
    assertAnyRefusal(compileCsharpSource({ surface, sourceText }));
  });

  test(`canonical source-any admission preserves typed native identity and unknown narrowing on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      class Box {
        value: int32;
        constructor(value: int32) { this.value = value; }
      }
      function identity(value: unknown): unknown { return value; }
      export function run(): boolean {
        const box = new Box(7 as int32);
        const value: unknown = identity(box);
        if (!(value instanceof Box)) return false;
        value.value = 11 as int32;
        const text: unknown = "native";
        return value === box && box.value === (11 as int32) &&
          typeof text === "string" && text.length === 6;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `source-any-native-unknown-${surface}`);
  });

  test(`source-any admission does not classify an ordinary member by its spelling on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      interface Row { any: string; }
      export function run(): boolean { const row: Row = { any: "any" }; return row.any === "any"; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
  });
}

test("canonical source-any admission refuses a current untyped library result without tracing its users", () => {
  assertAnyRefusal(compileCsharpSource({ surface: "js", sourceText: `
    export function read() { return JSON.parse("{}"); }
  ` }));
});

test("source-any admission ignores declaration metadata and retains checked provider boundaries", () => {
  const checked = checkCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
    import type { CpuUsage } from "node:process";
    import type { TlsOptions } from "node:tls";
    export function preserve(value: CpuUsage): CpuUsage { return value; }
    export function absent(value: TlsOptions): boolean { return value.cert === undefined; }
  ` });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const withMetadata = { ...source, navigation: { ...source.navigation, sourceFiles: source.sourceFiles },
    semantics: { ...source.semantics, forFile(sourceFile) {
      assert.equal(source.ast.isDeclarationFile(sourceFile), false, "library metadata is not a project any occurrence");
      return source.semantics.forFile(sourceFile);
    } } };
  assert.equal(analyzeCsharpSourceAnyAdmission(withMetadata).length, 0,
    "native provider identities and its nominal unknown option are not source any");
});

test("source-any admission reports the first checked declaration without consulting later declarations or origins", () => {
  const checked = checkCsharpSource({ sourceText: "export const first: any = 1; export const second: any = 2;" });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const sourceFile = source.navigation.sourceFiles.find(file => !source.ast.isDeclarationFile(file));
  const declarations = source.ast.statements(sourceFile).flatMap(statement => {
    const list = source.ast.as.AsVariableStatement(statement)?.DeclarationList;
    return list === undefined ? [] : source.ast.children(list).filter(node => source.ast.is.IsVariableDeclaration(node));
  });
  assert.equal(declarations.length, 2);
  const selected = { ...source, semantics: { ...source.semantics, forFile(file) {
    const queries = source.semantics.forFile(file);
    return { ...queries, types: { ...queries.types, expressionType(node) {
      assert.equal(node === declarations[1], false, "admission stops before later checked declarations");
      return queries.types.expressionType(node);
    } } };
  } } };
  const issues = analyzeCsharpSourceAnyAdmission(selected);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].sourceNode === declarations[0], true, "the actual first checked Node owns the refusal");
  assert.equal(Object.isFrozen(issues) && Object.isFrozen(issues[0]), true);
});
