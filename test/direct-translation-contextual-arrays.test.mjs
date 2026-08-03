import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("provider array-input capability materializes a native array literal", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
      export function create(): List<int> {
        return new List<int>([1, 2, 3]);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /return new System\.Collections\.Generic\.List<int>\(new int\[\] \{ 1, 2, 3 \}\);/u,
  );
});
