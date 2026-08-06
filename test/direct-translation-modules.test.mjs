import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation emits namespace-imported project functions through exact source references", () => {
  const compiled = compileCsharpSource({
    sourceText: [
      'import * as Store from "./store.js";',
      "export function read(): number { return Store.get(); }",
      "",
    ].join("\n"),
    files: {
      "store.ts": "export function get(): number { return 1; }\n",
    },
  });

  assert.deepEqual(compiled.targetDiagnostics, []);
  const generated = compiled.artifacts.get("src/Index.cs");
  assert.match(generated, /return Store\.get\(\);/);
  assert.doesNotMatch(generated, /\bStore\.Store\b|__unsupported/);
});

test("direct C# translation qualifies same-module values only across generated type owners", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      const offset: number = 8;
      export function top(value: number): number { return value + offset; }
      export class Counter {
        value: number;
        constructor(value: number) { this.value = value; }
        shifted(): number {
          const local = this.value;
          return local + offset;
        }
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
        public static double offset
        {
            get;
            private set;
        } = default(double)!;
        public static double top(double value)
        {
            return value + offset;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            offset = 8;
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public class Counter
    {
        public double value;
        public Counter(double value)
        {
            this.value = value;
        }
        public double shifted()
        {
            double local = this.value;
            return local + Index.offset;
        }
    }
}
`);
});
