import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { staticCallableAliasFiles, staticCallableAliasObjectFiles } from "../../../../tsonic/test/fixtures/static-callable-aliases.mjs";

test("static intrinsic aliases retain exact JS API calls without runtime wrappers", { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: staticCallableAliasFiles["index.ts"],
      files: { "predicates.ts": staticCallableAliasFiles["predicates.ts"] } });
    executeCsharpConstruction(compiled, "static-callable-aliases");
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /TsValue\.from|Func<[^;\n]+(?:initial|alias|minimum|predicate)|static [^;\n]+ (?:initial|alias|minimum|predicate)\s*=/u);
});

test("escaping or mutable intrinsic aliases do not obtain compile-only erasure", () => {
  for (const body of [
    "const alias = Array.isArray; export function escape(): typeof alias { return alias; }",
    "let alias = Array.isArray; export function run(value: unknown): boolean { return alias(value); }",
  ]) {
    const compiled = compileCsharpSource({ surface: "js", sourceText: body });
    assert.equal(compiled.sourceDiagnosticsText, "", body);
    assert.ok(compiled.targetDiagnostics.some(diagnostic => diagnostic.category === "error"), body);
    assert.equal(compiled.artifacts.size, 0, body);
  }
});

test("generic object methods do not retain compile-only intrinsic captures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: staticCallableAliasObjectFiles["index.ts"] });
  executeCsharpConstruction(compiled, "static-callable-alias-object");
  const source = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(source, /__tsonic_capture\d+\s*[;=]|(?:var|Func<[^;\n]+>)\s+(?:predicate|minimum)\b/u);
});
