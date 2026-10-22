import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { closedArrayPredicateFiles } from "../../../../tsonic/test/fixtures/closed-array-predicates.mjs";

test("closed array predicates retain native union payloads and evaluate once", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: closedArrayPredicateFiles["index.ts"],
    files: { "paths.ts": closedArrayPredicateFiles["paths.ts"] } });
  executeCsharpConstruction(compiled, "closed-array-predicates");
  const paths = compiled.artifacts.get("src/Paths.cs");
  assert.ok(paths);
  assert.match(paths, /switch/u);
  assert.match(paths, /return value\.IsArray\(\);/u);
  assert.doesNotMatch(paths, /TsValue\.from|\(object\)/u);
});
