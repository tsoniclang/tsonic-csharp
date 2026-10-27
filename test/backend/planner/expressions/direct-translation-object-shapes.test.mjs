import assert from "node:assert/strict";
import test from "node:test";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

test("nullable structural returns preserve exact authored member carriers", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function close(
        inner: string,
        closeEnd: int,
        endSuffix: string,
      ): { inner: string; endPos: int } | undefined {
        return { inner, endPos: closeEnd + endSuffix.length };
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /endPos = closeEnd \+ endSuffix\.Length,/u,
  );
});

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
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static ObjectShape_adbe2b47b126<double, string> clone(ObjectShape_e8dcbad87c09<double, string> input)
        {
            ObjectShape_e8dcbad87c09<double, string> __tsonic_value_174 = input;
            double ___tsonic_value_174 = __tsonic_value_174.id;
            string ____tsonic_value_174 = __tsonic_value_174.label;
            return new ObjectShape_bdd15b6025ff
            {
                id = ___tsonic_value_174,
                label = ____tsonic_value_174,
            };
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `namespace Tsonic.Generated
{
    public interface ObjectShape_adbe2b47b126<Property0, Property1>
    {
        Property0 id { get; set; }
        Property1 label { get; set; }
    }
    public class ObjectShape_bdd15b6025ff : ObjectShape_adbe2b47b126<double, string>
    {
        public required double id
        {
            get;
            set;
        }
        public required string label
        {
            get;
            set;
        }
    }
    public interface ObjectShape_e8dcbad87c09<out Property0, out Property1>
    {
        Property0 id { get; }
        Property1 label { get; }
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
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static double score(ObjectShape_6c256891dec8<string, double> result)
        {
            if (result.kind == "found")
            {
                ObjectShape_6c256891dec8<string, double> found = result;
                return found.value + 1;
            }
            ObjectShape_6c256891dec8<string, double> missing = result;
            return missing.value - 1;
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `namespace Tsonic.Generated
{
    public interface ObjectShape_6c256891dec8<Property0, Property1>
    {
        Property0 kind { get; set; }
        Property1 value { get; set; }
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
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static ObjectShape_bf14b3f9932a<double, string> left(ObjectShape_bf14b3f9932a<double, string> value)
        {
            return value;
        }
        public static ObjectShape_bf14b3f9932a<double, string> right(ObjectShape_bf14b3f9932a<double, string> value)
        {
            return value;
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `namespace Tsonic.Generated
{
    public interface ObjectShape_bf14b3f9932a<Property0, Property1>
    {
        Property0 alpha { get; set; }
        Property1 zeta { get; set; }
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
  // C-0745/C-0746: checked fixed method bodies use their native receivers, not eager delegate fields.
  assert.equal((source.match(/\bnew ObjectShape_[a-f0-9]+/gu) ?? []).length, 2,
    "the two authored objects retain their native constructions");
  assert.equal((shapes.match(/public double read\(\)/gu) ?? []).length, 2,
    "both authored implementations remain native methods");
  assert.match(shapes, /return 3;/u);
  assert.match(shapes, /return this\.value;/u);
  assert.doesNotMatch(source, /__tsonic_shape_method_\w+\s*=/u);
  assert.equal(executeCsharpConstruction(compiled, "native-object-method-receivers", false, false, [],
    'if (Tsonic.Generated.Index.total() != 10D) throw new System.Exception("Native method behavior"); System.Console.WriteLine("10");'),
  "10\n", "both original native method bodies execute with their own receiver");
});

for (const surface of [undefined, "js"]) {
  for (const exposure of ["closed", "external-input", "unrelated-opaque-invocation"]) {
    test(`method value selection reads exact member domains (${surface ?? "native"}, ${exposure})`, () => {
      const external = exposure === "external-input";
      const opaque = exposure === "unrelated-opaque-invocation";
      const compiled = compileCsharpSource({
        surface,
        sourceText: `
          ${opaque ? 'import { Console } from "@tsonic/csharp/System.js";' : ""}
          type Box = { value: number; read(): number };
          ${external ? `
            export function accept(input: Box): number { return input.read(); }
          ` : `
            export function run(): boolean {
              const box: Box = { value: 7, read(): number { return this.value; } };
              const alias = box;
              ${opaque ? "Console.WriteLine(0);" : ""}
              alias.value = 9;
              return alias === box && box.read() === 9;
            }
          `}
        `,
      });
      assert.equal(compiled.sourceDiagnosticsText, "", "checked source stays valid");
      assert.equal(compiled.extensionDiagnostics.length, 0, "no extension rejection");
      assert.equal(compiled.targetDiagnostics.length, 0, "exact native receivers stay admitted");
      assert.equal(compiled.result.program !== undefined, true, "analysis program is published");
      const { source, sourceFiles } = compiled.result.program;
      const storage = createSourceStorageQuery(source, sourceFiles);
      const method = storage.nodes.find(node => source.navigation.isProjectDeclaration(node) &&
        (external ? source.ast.is.IsMethodSignatureDeclaration(node) : source.ast.is.IsMethodDeclaration(node)));
      assert.equal(method !== undefined, true, "the original checked method declaration exists");
      const subject = storage.memberSubjectFor(method);
      assert.equal(subject.kind, "resolved", "the canonical method subject is available");
      const domain = storage.closedOriginsFor(subject.subject);
      assert.equal(domain.kind, external ? "open" : "complete", "domain belongs to this exact method slot");
      if (external) {
        assert.equal(domain.boundaries.some(boundary => boundary.kind === "external-input"), true,
          "the exported formal publishes an actual external-input domain boundary");
      }
      if (opaque) {
        assert.equal(storage.boundaries.some(boundary => boundary.kind === "opaque-invocation"), true,
          "an unrelated raw invocation boundary does not open the native method domain");
      }
      const members = compiled.result.program.objectShapes.knownShapes().flatMap(shape => shape.members)
        .filter(member => member.memberKind === "method" && member.sourceDeclarations?.includes(method));
      assert.equal(members.length > 0, true, "selected shapes retain the exact original method identity");
      assert.equal(members.every(member => (member.methodValueStorage?.kind === "delegate") === external), true,
        "only the externally supplied method needs value storage");
      if (!external) {
        const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs") ?? "";
        assert.match(shapes, /public double read\(\)/u);
        assert.doesNotMatch(shapes, /Func</u);
        assert.equal(executeCsharpConstruction(compiled, `method-domain-${surface ?? "native"}-${exposure}`),
          opaque ? "0\n" : "", "native receiver and alias identity are preserved without delegate storage");
      }
    });
  }
}

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
  assert.match(shapes, /Property0 run \{ get; set; \}/u);
  assert.match(shapes, /ObjectShape_[a-f0-9]{12}<Func<double, double>>/u);
  assert.match(shapes, /public required Func<double, double> run\s*\{\s*get;\s*set;\s*\}/u);
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
