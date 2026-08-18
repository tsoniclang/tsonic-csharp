import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation projects exact checker flow types for inferred locals and arrow parameters", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      class Base {}
      class Derived extends Base {
        value: string;
        constructor(value: string) { super(); this.value = value; }
      }
      export function fromElement(values: Base[]): string | undefined {
        const value = values[0]!;
        if (value instanceof Derived) return value.value;
        return undefined;
      }
      export const fromArrow = (value: Base): string | undefined =>
        value instanceof Derived ? value.value : undefined;
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
        public static string? fromElement(Base[] values)
        {
            Base value = values[0];
            if (value is Derived)
            {
                return ((Derived)value).value;
            }
            return null;
        }
        public static Func<Base, string?> fromArrow
        {
            get;
            private set;
        } = default(Func<Base, string?>)!;
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            fromArrow = (Base value) => value is Derived ? ((Derived)value).value : null;
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public class Base
    {
    }
    public class Derived : Base
    {
        public string value;
        public Derived(string value) : base()
        {
            this.value = value;
        }
    }
}
`);
});

test("direct C# translation projects exact checker flow types for property value references", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      class Base {}
      class Derived extends Base {
        value: string;
        constructor(value: string) { super(); this.value = value; }
      }
      class Holder {
        value: Base;
        constructor(value: Base) { this.value = value; }
      }
      export function assigned(holder: Holder): Derived | undefined {
        if (!(holder.value instanceof Derived)) return undefined;
        const narrowed = holder.value as Derived;
        return narrowed;
      }
      export function nested(holder: Holder): string | undefined {
        if (!(holder.value instanceof Derived)) return undefined;
        return (holder.value as Derived).value;
      }
      export function direct(holder: Holder): string | undefined {
        if (!(holder.value instanceof Derived)) return undefined;
        return holder.value.value;
      }
      class Box<T> {
        value: T;
        constructor(value: T) { this.value = value; }
      }
      export function generic(box: Box<string>): string {
        return box.value as string;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const artifact = compiled.artifacts.get("src/Index.cs");
  assert.match(artifact, /Derived narrowed = \(Derived\)holder\.value;/u);
  assert.equal(
    [...artifact.matchAll(/return \(\(Derived\)holder\.value\)\.value;/gu)].length,
    2,
  );
  assert.match(artifact, /return box\.value;/u);
});
