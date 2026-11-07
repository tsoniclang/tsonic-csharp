import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileEffectiveSource, assertPublishedRefusal } from "../../helpers/source-effective-types.mjs";

// Basis: K-2665 / C-2551 (N7 scope, PLAN.md §10 N7 and §4.3 typeof row; nextgen C-2542). Only `typeof v === "undefined"`
// and its negations on an operand admitting both null and undefined are refused (Host). An opaque operand (unknown, any)
// runs the existing dynamic TsValue typeof operation; a closed operand runs the Host category projected onto its carrier.

const emitted = compiled => [...compiled.artifacts.entries()].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");

test("typeof 'string' stays admitted on unknown, both-nullish, aliased and narrowed operands and executes", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
type MaybeText = string | null | undefined;
function opaque(v: unknown): boolean { return typeof v === "string"; }
function nullable(v: string | null | undefined): boolean { return typeof v === "string"; }
function aliased(v: MaybeText): boolean { return typeof v !== "string"; }
function narrowed(v: string | null | undefined): boolean { if (v == null) return false; return typeof v === "string"; }
export function run(): boolean {
  return opaque("text") && !opaque(1) && !opaque(undefined) && !opaque(null) &&
    nullable("text") && !nullable(null) && !nullable(undefined) &&
    !aliased("text") && aliased(null) && aliased(undefined) &&
    narrowed("text") && !narrowed(null) && !narrowed(undefined);
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = emitted(compiled);
  assert.match(output, /TsValue\.ApplyDynamicTypeof\(v\) == "string"/u, "the opaque operand compares the dynamic runtime typeof");
  assert.equal(output.match(/ApplyDynamicTypeof/gu)?.length, 1, "closed operands never route through the dynamic typeof operation");
  executeCsharpConstruction(compiled, "typeof-admission-positive");
});

test("a closed operand whose Host category is unproven is a C# refusal, never a carrier-chosen category", { timeout: 300_000 }, () => {
  // A type parameter's values prove no typeof category (N3'); its C# carrier cannot recover one (K-2658).
  const compiled = compileCsharpSource({ sourceText: `
export function f<T>(v: T): boolean { return typeof v === "string"; }
` });
  const errors = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.notEqual(errors.length, 0, "the unproven category is refused");
  assert.deepEqual([...new Set(errors.map(issue => issue.code))], ["CSHARP_TYPEOF_RUNTIME_KIND_NOT_PROVEN"]);
  assert.equal(compiled.artifacts.size, 0);
});

for (const surface of [undefined, "js"]) {
  test(`typeof comparisons on undefined-only and null-only operands follow the Host admission (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
function undefinedOnly(v: string | undefined): boolean { return typeof v === "undefined"; }
function optionalParameter(v?: string): string { return typeof v; }
function nullOnly(v: string | null): boolean { return typeof v === "undefined"; }
function nullObject(v: string | null): boolean { return typeof v === "object"; }
function bothString(v: string | null | undefined): boolean { return typeof v === "string"; }
export function run(): boolean {
  return undefinedOnly(undefined) && !undefinedOnly("text") &&
    optionalParameter() === "undefined" && optionalParameter("text") === "string" &&
    !nullOnly(null) && !nullOnly("text") && nullObject(null) && !nullObject("text") &&
    bothString("text") && !bothString(null) && !bothString(undefined);
}
` });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch(emitted(compiled), /ApplyDynamicTypeof/u, "closed operands use their Host categories");
    executeCsharpConstruction(compiled, `typeof-admission-opposites-${surface ?? "native"}`);
  });

  for (const [name, condition] of [
    ["strict", `typeof v === "undefined"`],
    ["negated", `typeof v !== "undefined"`],
    ["reversed loose", `"undefined" == typeof v`],
  ]) {
    test(`N7: ${name} typeof 'undefined' on an operand admitting both null and undefined is the Host refusal (${surface ?? "native"})`,
      { timeout: 300_000 }, () => {
        const compiled = compileEffectiveSource(surface, `
type MaybeText = string | null | undefined;
export function f(v: MaybeText): boolean { return ${condition}; }
`);
        assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_UNION", condition);
      });
  }
}
