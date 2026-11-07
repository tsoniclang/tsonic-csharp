import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const cases = [
  ["accessor", "return { get count(): number { return 7; } };", "count"],
  ["method", "return { read(): number { return 7; } };", "read"],
  ["spread", "return { ...{ count: 7 } };", "count"],
  ["effectful key", 'return { [key()]: 7 };', "count"],
];

for (const surface of ["native", "js"]) {
  for (const [name, body, member] of cases) {
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
      if (name === "effectful key") {
        // nextgen C-2542: an effectful computed key is a Source-form refusal owned by the Host property-name analysis
        // (analyses.propertyNameIssues(), forwarded once with message and site unchanged); C# no longer originates
        // CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN for it. The exact Host code is pending (R-B2-3).
        assert.match(issues[0].code, /^TSONIC_/u, "the Host property-name owner rejects effectful keys");
        assert.equal(issues[0].message,
          "A computed property key call must retain its effects and cannot be replaced with a static native field name.",
          "the complete existing effect-preservation refusal remains exact");
        assert.equal(compiled.source.ast.is.IsComputedPropertyName(issues[0].sourceNode), true,
          "the original checked computed property name owns the refusal");
      } else {
        // nextgen C-2542: CSHARP_UNSUPPORTED_AST is removed (I7) and the "named data properties" refusal text has not
        // existed in src since 126f37427 (before this round); no src site emits it. The stale code and message are not
        // asserted; the refusal must carry one specific code and stay at the original literal (R-T6-4: pin the code at
        // the first test run).
        assert.notEqual(issues[0].code, "CSHARP_UNSUPPORTED_AST", "unsupported dynamic storage is a precise refusal, not a catch-all");
        assert.match(issues[0].code, /^(CSHARP|TSONIC)_[A-Z0-9_]+$/u, "the refusal names its owner's code");
        assert.equal(compiled.source.ast.is.IsObjectLiteralExpression(issues[0].sourceNode), true,
          "the selected construction's original checked literal owns the refusal");
      }
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
