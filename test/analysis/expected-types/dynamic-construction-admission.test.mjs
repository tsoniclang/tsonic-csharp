import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDiagnosticSpanReader } from "@tsonic/target-api/source";
import { finalizeTargetDiagnostics } from "../../../../tsonic/packages/host/dist/diagnostics.js";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const cases = [
  ["accessor", "return { get count(): number { return 7; } };", "count"],
  ["method", "return { read(): number { return 7; } };", "read"],
  ["spread", "return { ...{ count: 7 } };", "count"],
  ["effectful key", 'return { [key()]: 7 };', "count"],
];

function assertCanonicalAnyRefusal(compiled) {
  assertCsharpCheckingSucceeded(compiled);
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1,
    `one precise shared any refusal: ${issues.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
  const issue = issues[0];
  assert.equal(issue.code, "TSONIC_ANY_UNSUPPORTED", "the original any source is refused without a dynamic storage selector");
  assert.equal(issue.message, "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
  const ast = compiled.source.ast;
  const nodes = new Set();
  const visit = node => {
    nodes.add(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  compiled.source.sourceFiles.filter(file => file !== undefined && !ast.isDeclarationFile(file)).forEach(visit);
  assert.equal(nodes.has(issue.sourceNode), true, "the refusal retains the original checked project occurrence");
  const file = ast.getSourceFile(issue.sourceNode);
  const queries = compiled.source.getSourceFileQueries(file);
  assert.equal(queries.typeShape.isAny(queries.checker.getTypeAtLocation(issue.sourceNode)), true,
    "the refusal belongs to a real checked any value or authored type, not the native construction");
  const span = createSourceDiagnosticSpanReader(ast)(file, ast.pos(issue.sourceNode), ast.end(issue.sourceNode));
  assert.equal(span !== undefined, true, "the original source occurrence retains actual coordinates");
  const finalized = finalizeTargetDiagnostics(compiled.source, [issue], "/project")[0];
  assert.deepEqual(finalized.sourceSpan, { ...span, fileName: "index.ts" }, "the canonical any diagnostic keeps its real source span");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "the missing shared admission cannot publish a native fallback or partial artifacts");
}

for (const surface of ["native", "js"]) {
  for (const [name, body, member] of cases) {
    test(`an unsupported dynamic ${name} construction is refused at its owner before publication on ${surface}`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
function key(): "count" { return "count"; }
export function make(): unknown { ${body} }
export function read(): unknown { const observed: any = make(); return observed.${member}; }
` });
      if (name !== "effectful key") {
        assertCanonicalAnyRefusal(compiled);
        return;
      }
      assertCsharpCheckingSucceeded(compiled);
      const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
      assert.equal(issues.length, 1,
        `one precise dynamic construction refusal: ${issues.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      assert.equal(issues[0].code, "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN", "the existing checked property-name owner rejects effectful keys");
      assert.equal(issues[0].message,
        "A computed property key call must retain its effects and cannot be replaced with a static native field name.",
        "the complete existing effect-preservation refusal remains exact");
      assert.equal(compiled.source.ast.is.IsComputedPropertyName(issues[0].sourceNode), true,
        "the original checked computed property name owns the refusal");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
        true, "a dynamic requirement cannot publish a native-shape fallback or partial artifacts");
    });
  }

  test(`effectful native computed keys preserve their exact construction refusal without any on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
function key(): "count" { return "count"; }
export function make(): unknown { return { [key()]: 7 }; }
` });
    assertCsharpCheckingSucceeded(compiled);
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "the original effectful property-name operation has one exact refusal");
    assert.equal(issues[0].code, "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN");
    assert.equal(issues[0].message,
      "A computed property key call must retain its effects and cannot be replaced with a static native field name.");
    const ast = compiled.source.ast;
    assert.equal(ast.is.IsComputedPropertyName(issues[0].sourceNode), true,
      "the original checked computed property name owns the effect-preserving refusal");
    const file = ast.getSourceFile(issues[0].sourceNode);
    const span = createSourceDiagnosticSpanReader(ast)(file, ast.pos(issues[0].sourceNode), ast.end(issues[0].sourceNode));
    assert.equal(span !== undefined, true, "the computed key has real checked source coordinates");
    const finalized = finalizeTargetDiagnostics(compiled.source, issues, "/project")[0];
    assert.deepEqual(finalized.sourceSpan, { ...span, fileName: "index.ts" });
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
      true, "the effectful-key refusal still prevents every publication");
  });

  test(`native accessor, method and spread constructions remain native when no dynamic receiver is required on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function run(): boolean {
  let reads: number = 0;
  const getter = { get count(): number { reads += 1; return 7; } };
  const method = { read(): number { return 13; } };
  const original = { count: 17 };
  const spread = { ...original, extra: 19 };
  return getter.count === 7 && reads === 1 && method.read() === 13 && spread.count === 17 && spread.extra === 19;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-construction-admission-control-${surface}`);
  });
}
