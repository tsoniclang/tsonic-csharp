import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const cases = [
  ["accessor", "return { get count(): number { return 7; } };", "count", "named data properties"],
  ["method", "return { read(): number { return 7; } };", "read", "named data properties"],
  ["spread", "return { ...{ count: 7 } };", "count", "named data properties"],
  ["effectful key", 'return { [key()]: 7 };', "count", "effect-free constant member names"],
];

for (const surface of ["native", "js"]) {
  for (const [name, body, member, reason] of cases) {
    test(`an unsupported dynamic ${name} construction is refused at its owner before publication on ${surface}`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
function key(): "count" { return "count"; }
export function make(): unknown { ${body} }
export function read(): unknown { const observed: any = make(); return observed.${member}; }
` });
      assertCsharpCheckingSucceeded(compiled);
      const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
      assert.equal(issues.length, 1,
        `one precise dynamic construction refusal: ${issues.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      assert.equal(issues[0].code, "CSHARP_UNSUPPORTED_AST", "unsupported dynamic storage is a source refusal, not an internal failure");
      assert.equal(issues[0].message.includes(reason), true, "the actual unsupported dynamic member contract is named");
      assert.equal(compiled.source.ast.is.IsObjectLiteralExpression(issues[0].sourceNode), true,
        "the selected construction's original checked literal owns the refusal");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
        true, "a dynamic requirement cannot publish a native-shape fallback or partial artifacts");
    });
  }

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
