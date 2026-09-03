import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

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
      let offset: number = 8;
      export function top(value: number): number { return value + offset; }
      export class Counter {
        value: number;
        constructor(value: number) { this.value = value; }
        shifted(): number {
          const local = this.value;
          return local + offset;
        }
        setOffset(value: number): void {
          offset = value;
        }
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
        public static double offset
        {
            get;
            internal set;
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
        public void setOffset(double value)
        {
            Index.offset = value;
        }
    }
}
`);
});

test("effect-free module closures omit module-initialization scaffolding", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { read } from "./pure.js";
      export function main(): number { return read(); }
    `,
    files: {
      "pure.ts": `
        export let pending: number;
        export function read(): number { return pending; }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  for (const source of compiled.artifacts.values()) {
    assert.doesNotMatch(source, /__tsonic_module_init/u);
  }
  assert.equal(compiled.artifacts.has("generated/TsonicModuleInitializer.cs"), false);
});

test("transitive runtime effects retain exactly the required initializer chain", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { read } from "./bridge.js";
      export function main(): number { return read(); }
    `,
    files: {
      "bridge.ts": `
        import { value } from "./state.js";
        export function read(): number { return value; }
      `,
      "state.ts": "export const value: number = 42;\n",
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const entry = compiled.artifacts.get("src/Index.cs");
  const bridge = compiled.artifacts.get("src/Bridge.cs");
  const state = compiled.artifacts.get("src/State.cs");
  assert.match(entry, /Bridge\.__tsonic_module_init\(\);/u);
  assert.match(bridge, /State\.__tsonic_module_init\(\);/u);
  assert.match(state, /value = 42;/u);
  assert.match(state, /public static void __tsonic_module_init\(\)/u);
});
