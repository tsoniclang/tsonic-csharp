import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("selected Record index evidence preserves authored key and value representations", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function writeAndRead(
        values: Record<string, int>,
        key: string,
        value: int,
      ): int {
        values[key] = value;
        return values[key];
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /public static int writeAndRead\(System\.Collections\.Generic\.Dictionary<string, int> values, string key, int value\)[\s\S]*values\[key\] = value;[\s\S]*return values\[key\];/u,
  );
});
