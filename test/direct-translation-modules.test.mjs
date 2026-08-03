import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation emits namespace-imported project functions through exact source references", () => {
  const compiled = compileCsharpSource({
    sourceText: [
      'import * as Store from "./store.js";',
      "export function read(): number { return Store.get(); }",
      "",
    ].join("\n"),
    files: {
      "store.ts": "export function get(): number { return 1; }\n",
    },
  });

  assert.deepEqual(compiled.targetDiagnostics, []);
  const generated = compiled.artifacts.get("src/Index.cs");
  assert.match(generated, /return Store\.get\(\);/);
  assert.doesNotMatch(generated, /\bStore\.Store\b|__unsupported/);
});
