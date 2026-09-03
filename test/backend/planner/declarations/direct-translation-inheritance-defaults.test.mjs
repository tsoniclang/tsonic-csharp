import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

test("selected source defaults close every emitted C# generic type use", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class DefaultBase<T = string> {}
    export class DefaultStringBox extends DefaultBase {}
    export function consume(value: DefaultBase<string>): void {}
    export function echo(value: DefaultBase): DefaultBase { return value; }
    export function run(): void { consume(new DefaultStringBox()); }
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static void consume(DefaultBase<string> value)
        {
        }
        public static DefaultBase<string> echo(DefaultBase<string> value)
        {
            return value;
        }
        public static void run()
        {
            consume(new DefaultStringBox());
        }
    }
    public class DefaultBase<T>
    {
    }
    public class DefaultStringBox : DefaultBase<string>
    {
        public DefaultStringBox() : base()
        {
        }
    }
}
`);
});
