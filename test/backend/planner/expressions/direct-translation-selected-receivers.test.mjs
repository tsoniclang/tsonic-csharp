import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("selected receivers preserve exact nested authored array representations", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { float, long } from "@tsonic/csharp/types.js";
      export function readLong(values: long[][]): long {
        return values[0][0];
      }
      export function readFloat(values: float[][]): float {
        return values[0][0];
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /public static long readLong\(Tsonic\.CSharp\.Js\.JSArray<Tsonic\.CSharp\.Js\.JSArray<long>> values\)[\s\S]*return values\[0\]\[0\];/u,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /public static float readFloat\(Tsonic\.CSharp\.Js\.JSArray<Tsonic\.CSharp\.Js\.JSArray<float>> values\)[\s\S]*return values\[0\]\[0\];/u,
  );
});
