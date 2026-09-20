import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("direct C# translation preserves method values and materializes omitted delegate arguments", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export class Parser {
        static parse(value: string): string { return value; }
      }
      export const parse = Parser.parse;
      const join = (left: string, right?: string): string =>
        right === undefined ? left : left + right;
      export function run(): string { return parse(join("a")); }
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
        public static Func<string, string> parse
        {
            get;
            private set;
        } = default(Func<string, string>)!;
        internal static string join(string left, string? right)
        {
            return right is null ? left : left + right;
        }
        public static string run()
        {
            return parse(join("a", null));
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            parse = Parser.parse;
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public class Parser
    {
        public static string parse(string value)
        {
            return value;
        }
    }
}
`);
});

test("direct C# translation evaluates an omitted reference delegate default in the callee", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      const defaulted = (value: string = "x"): string => value;
      export function run(): string { return defaulted(); }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /internal static string defaulted\(string\? __tsonic_param0\)/u);
  assert.match(source, /return defaulted\(null\);/u);
  assert.match(source, /string value = __tsonic_param0 \?\? "x";/u);
  assert.match(source, /return value;/u);
});

test("direct C# translation preserves omission on a source method with an emitted optional parameter", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function optional(value?: string): string {
        return value ?? "fallback";
      }
      export function run(): string { return optional(); }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static string optional(string? value = null)
        {
            return value ?? "fallback";
        }
        public static string run()
        {
            return optional();
        }
    }
}
`);
});
