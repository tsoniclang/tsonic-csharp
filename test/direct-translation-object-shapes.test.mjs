import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation derives mapped utility shapes from exact project member provenance", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      type Mutable = { id: number; label: string };
      type ReadOnlyShape = Readonly<Mutable>;
      export function clone(input: ReadOnlyShape): Mutable {
        return { ...input };
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static __TsonicShape_e6956318a4d8910bc105feec9290210565fcb68e8ce6124578fcf0035bb9f247 clone(__TsonicShape_e6956318a4d8910bc105feec9290210565fcb68e8ce6124578fcf0035bb9f247 input)
        {
            return new __TsonicShape_e6956318a4d8910bc105feec9290210565fcb68e8ce6124578fcf0035bb9f247
            {
                id = input.id,
                label = input.label,
            };
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_e6956318a4d8910bc105feec9290210565fcb68e8ce6124578fcf0035bb9f247
    {
        public required double id;
        public required string label;
    }
}
`,
  );
});

test("direct C# translation coalesces duplicate structural union carriers without inventing nullability", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      type Found = { kind: "found"; value: number };
      type Missing = { kind: "missing"; value: number };
      type Lookup = Found | Missing;
      export function score(result: Lookup): number {
        if (result.kind === "found") {
          const found: Found = result;
          return found.value + 1;
        }
        const missing: Missing = result;
        return missing.value - 1;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static double score(__TsonicShape_3e11f5fe38ae4cd59d9d2f21c087fb3872861ac5a46e456c4c897f1234fd781e result)
        {
            if (result.kind == "found")
            {
                __TsonicShape_3e11f5fe38ae4cd59d9d2f21c087fb3872861ac5a46e456c4c897f1234fd781e found = result;
                return found.value + 1;
            }
            __TsonicShape_3e11f5fe38ae4cd59d9d2f21c087fb3872861ac5a46e456c4c897f1234fd781e missing = result;
            return missing.value - 1;
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_3e11f5fe38ae4cd59d9d2f21c087fb3872861ac5a46e456c4c897f1234fd781e
    {
        public required string kind;
        public required double value;
    }
}
`,
  );
});
