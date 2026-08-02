import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("provider-selected JSON deserialization uses an exact constructible project shape", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { JsonSerializer } from "@tsonic/dotnet/System.Text.Json.js";
      import type { int } from "@tsonic/csharp/types.js";
      export interface Input { title: string; count: int; }
      export function parse(json: string): Input | undefined {
        const value = JsonSerializer.Deserialize<Input>(json);
        return value;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  assert.ok(source);
  assert.ok(shapes);
  const selectedCarrier = source.match(
    /JsonSerializer\.Deserialize<(__TsonicShape_[0-9a-f]{64})>\(json\)/,
  )?.[1];
  assert.ok(selectedCarrier);
  assert.equal(source.includes("JsonSerializer.Deserialize<Input>(json)"), false);
  assert.equal(source.includes("Input? value ="), true);
  assert.equal(
    shapes,
    `using System;

namespace Tsonic.Generated
{
    public class ${selectedCarrier} : Input
    {
        public required string title
        {
            get;
            set;
        }
        public required int count
        {
            get;
            set;
        }
    }
}
`,
  );
});
