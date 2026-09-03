import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

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
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Models.cs"), `namespace Tsonic.Generated
{
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
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
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
    }
}
`);
});

test("source callable contracts close imported generic calls independent of caller-first discovery", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { identity } from "./z-library.js";
      export function run(value: int): int { return identity<int>(value); }
    `,
    files: {
      "z-library.ts": `
        export function identity<T>(value: T): T { return value; }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/ZLibrary.cs"), `namespace Tsonic.Generated
{
    public static class ZLibrary
    {
        public static T identity<T>(T value)
        {
            return value;
        }
    }
}
`);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static int run(int value)
        {
            return ZLibrary.identity<int>(value);
        }
    }
}
`);
});
