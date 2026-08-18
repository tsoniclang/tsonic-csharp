import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

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

test("object-literal method receiver requirements replan every implementation of one structural shape", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      type Box = { value: number; read(): number };
      export function total(): number {
        const direct: Box = {
          value: 3,
          read(): number { return 3; },
        };
        const receiver: Box = {
          value: 7,
          read(): number { return this.value; },
        };
        return direct.read() + receiver.read();
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs") ?? "";
  assert.equal((source.match(/__tsonic_shape_method_\w+ =/gu) ?? []).length, 2);
  assert.match(
    shapes,
    /public required Func<__TsonicShape_[a-f0-9]{64}, double> __tsonic_shape_method_/u,
  );
  assert.match(shapes, /return __tsonic_shape_method_\w+\(this\);/u);
});

test("object-literal callable properties remain ordinary delegates and reject unproven receiver binding", () => {
  const accepted = compileCsharpSource({
    sourceText: `
      type Handler = { run: (value: number) => number };
      export function create(): Handler {
        return { run(value): number { return value + 1; } };
      }
    `,
  });
  assert.equal(accepted.sourceDiagnosticsText, "");
  assert.deepEqual(accepted.extensionDiagnostics, []);
  assert.deepEqual(accepted.targetDiagnostics, []);
  const shapes = accepted.artifacts.get("generated/TsonicObjectShapes.cs") ?? "";
  assert.match(shapes, /public required Func<double, double> run;/u);
  assert.doesNotMatch(shapes, /__tsonic_shape_method_/u);

  const rejected = compileCsharpSource({
    sourceText: `
      type Handler = { value: number; run: () => number };
      export function create(): Handler {
        return { value: 1, run(): number { return this.value; } };
      }
    `,
  });
  assert.equal(rejected.sourceDiagnosticsText, "");
  assert.ok(rejected.targetDiagnostics.some(({ message }) =>
    message.includes("cannot bind lexical 'this' without an exact receiver-bearing method contract")
  ));
  assert.equal(rejected.result.artifacts.length, 0);
});

test("object-literal accessors lower through exact getter and setter delegates", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function update(seed: number): number {
        let backing = seed;
        const value = {
          get current(): number { return backing; },
          set current(next: number) { backing = next; },
          get doubled(): number { return this.current * 2; },
        };
        value.current += 3;
        return value.doubled;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs") ?? "";
  assert.match(source, /__tsonic_shape_accessor_getter_\w+ =/u);
  assert.match(source, /__tsonic_shape_accessor_setter_\w+ =/u);
  assert.match(source, /value\.current \+= 3/u);
  assert.match(source, /return value\.doubled/u);
  assert.match(shapes, /public required Func<[^,>]+, double> __tsonic_shape_accessor_getter_/u);
  assert.match(shapes, /public required Action<[^,>]+, double> __tsonic_shape_accessor_setter_/u);
  assert.match(shapes, /return __tsonic_shape_accessor_getter_\w+\(this\)/u);
  assert.match(shapes, /__tsonic_shape_accessor_setter_\w+\(this, value\)/u);
});

test("getter-only object literals preserve readonly property contracts", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      type Snapshot = { readonly value: number };
      export function read(seed: number): number {
        const snapshot: Snapshot = {
          get value(): number { return seed; },
        };
        return snapshot.value;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs") ?? "";
  assert.match(shapes, /public double value/u);
  assert.doesNotMatch(shapes, /set\s*\{/u);
});

test("object-literal accessors fail closed without a complete native property contract", () => {
  const setterOnly = compileCsharpSource({
    sourceText: `
      export function write(): void {
        const value = { set current(next: number) {} };
        value.current = 1;
      }
    `,
  });
  assert.equal(setterOnly.sourceDiagnosticsText, "");
  assert.ok(setterOnly.targetDiagnostics.some(({ message }) =>
    message.includes("has no getter and therefore no exact native read carrier")));

  const writableContract = compileCsharpSource({
    sourceText: `
      type Mutable = { value: number };
      export function read(): number {
        const value: Mutable = { get value(): number { return 1; } };
        return value.value;
      }
    `,
  });
  assert.equal(writableContract.sourceDiagnosticsText, "");
  assert.ok(writableContract.targetDiagnostics.some(({ message }) =>
    message.includes("cannot satisfy the selected writable property contract")));
});
