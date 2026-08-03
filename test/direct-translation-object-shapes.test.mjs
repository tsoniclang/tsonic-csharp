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
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static __TsonicShape_8f634654c128e4e535990a963f0c96be7b2e377255b1de80720440f538998ce9 clone(__TsonicShape_8f634654c128e4e535990a963f0c96be7b2e377255b1de80720440f538998ce9 input)
        {
            return new __TsonicShape_8f634654c128e4e535990a963f0c96be7b2e377255b1de80720440f538998ce9
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
    public class __TsonicShape_8f634654c128e4e535990a963f0c96be7b2e377255b1de80720440f538998ce9
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
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static double score(__TsonicShape_ce218ab765e2e25da20d4b3ff0be58c13c20c2bef516b9985d5833cd5a36988b result)
        {
            if (result.kind == "found")
            {
                __TsonicShape_ce218ab765e2e25da20d4b3ff0be58c13c20c2bef516b9985d5833cd5a36988b found = result;
                return found.value + 1;
            }
            __TsonicShape_ce218ab765e2e25da20d4b3ff0be58c13c20c2bef516b9985d5833cd5a36988b missing = result;
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
    public class __TsonicShape_ce218ab765e2e25da20d4b3ff0be58c13c20c2bef516b9985d5833cd5a36988b
    {
        public required string kind;
        public required double value;
    }
}
`,
  );
});

test("structural object-shape identity is independent of source member order", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      type Forward = { zeta: string; alpha: number };
      type Reverse = { alpha: number; zeta: string };
      export function left(value: Forward): Forward { return value; }
      export function right(value: Reverse): Reverse { return value; }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static __TsonicShape_e9abbadafeb069d16a6148a5b05d704e9b2a9443e5128b5b611de88c37f2a41d left(__TsonicShape_e9abbadafeb069d16a6148a5b05d704e9b2a9443e5128b5b611de88c37f2a41d value)
        {
            return value;
        }
        public static __TsonicShape_e9abbadafeb069d16a6148a5b05d704e9b2a9443e5128b5b611de88c37f2a41d right(__TsonicShape_e9abbadafeb069d16a6148a5b05d704e9b2a9443e5128b5b611de88c37f2a41d value)
        {
            return value;
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_e9abbadafeb069d16a6148a5b05d704e9b2a9443e5128b5b611de88c37f2a41d
    {
        public required double alpha;
        public required string zeta;
    }
}
`,
  );
});
