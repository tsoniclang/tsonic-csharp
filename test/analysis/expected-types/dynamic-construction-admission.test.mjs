import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertCanonicalAnyRefusal } from "../../helpers/source-any-refusals.mjs";

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
      assertCanonicalAnyRefusal(compiled);
    });
  }

  test(`non-any effectful-key companion retains the exact computed-name refusal on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
function key(): "count" { return "count"; }
export function make(): unknown { return { [key()]: 7 }; }
` });
    assertCsharpCheckingSucceeded(compiled);
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1,
      `one precise computed-name refusal: ${issues.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
    assert.equal(issues[0].code, "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN",
      "the existing checked property-name owner still rejects an effectful native key");
    assert.equal(issues[0].message,
      "A computed property key call must retain its effects and cannot be replaced with a static native field name.",
      "the original complete effect-preservation refusal remains exact");
    assert.equal(compiled.source.ast.is.IsComputedPropertyName(issues[0].sourceNode), true,
      "the original checked computed property name owns the refusal");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
      true, "the typed control publishes no native-shape fallback or partial artifacts");
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
