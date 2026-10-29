import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDiagnosticSpanReader } from "@tsonic/target-api/source";
import { finalizeTargetDiagnostics } from "../../../../tsonic/packages/host/dist/diagnostics.js";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of ["native", "js"]) {
  test(`a dynamically read container does not impose its representation on an untouched nested native payload on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
export function make(): unknown { return { child: { count: 7 as int32 } }; }
export function read(): unknown { const value: any = make(); return value.child; }
` });
    assertCsharpCheckingSucceeded(compiled);
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "the original any source requires one shared admission refusal");
    const issue = issues[0];
    assert.equal(issue.code, "TSONIC_ANY_UNSUPPORTED");
    assert.equal(issue.message, "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
    const ast = compiled.source.ast;
    const nodes = new Set();
    const visit = node => {
      nodes.add(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    compiled.source.sourceFiles.filter(file => file !== undefined && !ast.isDeclarationFile(file)).forEach(visit);
    assert.equal(nodes.has(issue.sourceNode), true, "the refusal retains the original project source identity");
    const file = ast.getSourceFile(issue.sourceNode);
    const queries = compiled.source.getSourceFileQueries(file);
    assert.equal(queries.typeShape.isAny(queries.checker.getTypeAtLocation(issue.sourceNode)), true,
      "the refusal belongs to actual checked any, not the untouched native payload");
    const span = createSourceDiagnosticSpanReader(ast)(file, ast.pos(issue.sourceNode), ast.end(issue.sourceNode));
    assert.equal(span !== undefined, true, "the original source occurrence has exact checked coordinates");
    const finalized = finalizeTargetDiagnostics(compiled.source, [issue], "/project")[0];
    assert.deepEqual(finalized.sourceSpan, { ...span, fileName: "index.ts" });
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
      true, "the missing shared gate cannot publish a native fallback");
  });

  test(`declared native containers retain their exact nested payload identity on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Child { count: int32; }
interface Container { child: Child; }
export function make(): Container { return { child: { count: 7 as int32 } }; }
export function read(): Child { const value: Container = make(); return value.child; }
export function child(value: Container): Child { return value.child; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the checked constructions are published");
    const ast = program.source.ast;
    const literals = [];
    const visit = node => {
      if (ast.is.IsObjectLiteralExpression(node)) literals.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(literals.length, 2, "the container and payload are distinct checked allocations");
    const container = program.records.nativeExpression.get(literals[0])?.physical;
    const payload = program.records.nativeExpression.get(literals[1])?.physical;
    assert.equal(container !== undefined && container.kind !== "erased" && container.dynamicObject === undefined &&
      container.objectShape !== undefined, true, "the container uses its own declared native fields, not a later dynamic reader");
    assert.equal(payload !== undefined && payload.kind !== "erased" && payload.dynamicObject === undefined &&
      payload.objectShape !== undefined, true, "syntactic nesting does not create a dynamic receiver obligation");
    const count = payload.objectShape.members.find(member => member.sourceName === "count");
    assert.equal(count?.type.kind === "source-primitive" && count.type.name === "int32", true,
      "the untouched native payload retains its exact int32 field");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(generated, /TsObject|ReadDynamicSlot\(|WriteDynamicSlot\(|CreateDynamicObject\(|System\.Reflection|\bdynamic\b/u,
      "neither native allocation acquires a dynamic dictionary, wrapper or reflective access");
    executeCsharpConstruction(compiled, `declared-nested-native-identity-${surface}`, false, false, [], `
var container = Tsonic.Generated.Index.make();
var first = container.child;
var second = container.child;
if (first.count != 7 || !object.ReferenceEquals(first, second) ||
    !object.ReferenceEquals(first, Tsonic.Generated.Index.child(container)))
    throw new System.Exception("native nested payload identity");
if (Tsonic.Generated.Index.read().count != 7)
    throw new System.Exception("native nested payload survives the declared return boundary");
`);
  });
}
