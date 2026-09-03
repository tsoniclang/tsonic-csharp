import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

test("implicit derived constructors forward exact selected generic and optional source parameters", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    export class Base<T> {
      constructor(value: T, count?: int) { void value; void count; }
    }
    export class Derived extends Base<string> {}
    export function run(): Derived { return new Derived("ready", 1); }
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static Derived run()
        {
            return new Derived("ready", 1);
        }
    }
    public class Base<T>
    {
        public Base(T value, int? count = null)
        {
            _ = value;
            _ = count;
        }
    }
    public class Derived : Base<string>
    {
        public Derived(string value) : base(value)
        {
        }
        public Derived(string value, int? count) : base(value, count)
        {
        }
    }
}
`);
});

test("inherited required constructors prevent invalid C# object initializers", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class Base {
      value: string;
      constructor(value: string) { this.value = value; }
    }
    export class Derived extends Base {}
    export const item: Derived = { value: "ready" };
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_UNSUPPORTED_AST",
      message:
        "Class object literal emission requires an exact constructible source class with a parameterless constructor.",
    }],
  );
  assert.deepEqual([...compiled.artifacts], []);
});
