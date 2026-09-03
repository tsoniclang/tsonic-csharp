import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

test("direct C# translation preserves exact generic and transitive project heritage", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export interface Named<T> {}
    export class Base<T> {}
    export class Middle<T> extends Base<T> implements Named<T> {}
    export class StringBox extends Middle<string> {}
    export function consumeBase(value: Base<string>): void {}
    export function consumeNamed(value: Named<string>): void {}
    export function narrow(value: Base<string>): StringBox { return value as StringBox; }
    export function run(): void {
      const value = new StringBox();
      consumeBase(value);
      consumeNamed(value);
    }
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static void consumeBase(Base<string> value)
        {
        }
        public static void consumeNamed(Named<string> value)
        {
        }
        public static StringBox narrow(Base<string> value)
        {
            return (StringBox)value;
        }
        public static void run()
        {
            StringBox value = new StringBox();
            consumeBase(value);
            consumeNamed(value);
        }
    }
    public interface Named<T>
    {
    }
    public class Base<T>
    {
    }
    public class Middle<T> : Base<T>, Named<T>
    {
        public Middle() : base()
        {
        }
    }
    public class StringBox : Middle<string>
    {
        public StringBox() : base()
        {
        }
    }
}
`);
});
