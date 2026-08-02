import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "./helpers/direct-csharp-session.mjs";

test("direct C# translation preserves exact project heritage across source modules", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Base, Derived } from "./models.js";
      export function consume(value: Base<string>): void {}
      export function run(): void { consume(new Derived()); }
    `,
    files: {
      "models.ts": `
        export class Base<T> {}
        export class Middle<T> extends Base<T> {}
        export class Derived extends Middle<string> {}
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Models.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Models
    {
        static Models()
        {
        }
        public static void __tsonic_module_init()
        {
        }
    }
    public class Base<T>
    {
    }
    public class Middle<T> : Base<T>
    {
        public Middle() : base()
        {
        }
    }
    public class Derived : Middle<string>
    {
        public Derived() : base()
        {
        }
    }
}
`);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static void consume(Base<string> value)
        {
        }
        public static void run()
        {
            consume(new Derived());
        }
        static Index()
        {
            Models.__tsonic_module_init();
        }
        public static void __tsonic_module_init()
        {
        }
    }
}
`);
});
