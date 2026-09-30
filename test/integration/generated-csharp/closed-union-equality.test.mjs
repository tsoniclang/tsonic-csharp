import test from "node:test";
import assert from "node:assert/strict";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { closedUnionEqualitySource } from "../../../../tsonic/test/fixtures/closed-union-equality.mjs";

test("closed union equality borrows exact payloads and preserves identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: closedUnionEqualitySource });
  executeCsharpConstruction(compiled, "closed-union-equality");
  const generated = compiled.artifacts.get("src/Index.cs");
  const path = generated.split("bool path(")[1]?.split("public static")[0];
  assert.ok(path !== undefined);
  assert.match(path, /switch/u);
  assert.doesNotMatch(path, /EqualityComparer|\.Equals\(|Func<|new |\.Match\(/u);
});

test("closed union comparison preserves imported alias and callable identities", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: { "values.ts": closedUnionEqualitySource },
    sourceText: 'import { run as imported } from "./values.js"; export function run(): boolean { return imported(); }',
  }), "cross-file-union-equality");
});
