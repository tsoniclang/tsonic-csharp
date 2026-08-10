import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

function compileAsyncIteration(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled.artifacts.get("src/Index.cs") ?? "";
}

test("for await consumes exact async iterator evidence through await foreach", () => {
  const source = compileAsyncIteration(`
    import type { int } from "@tsonic/csharp/types.js";
    async function* rows(): AsyncGenerator<int, string, unknown> {
      yield 1;
      yield 2;
      return "done";
    }
    export async function total(): Promise<int> {
      let result: int = 0;
      for await (const row of rows()) {
        result += row;
      }
      return result;
    }
  `);

  assert.match(source, /await foreach \(int row in/);
  assert.doesNotMatch(source, /CSHARP_UNSUPPORTED|__unsupported/);
});

test("for await adapts a synchronous generator only at the async consumption site", () => {
  const source = compileAsyncIteration(`
    import type { int } from "@tsonic/csharp/types.js";
    function* rows(): Generator<int, string, unknown> {
      yield 1;
      yield 2;
      return "done";
    }
    export async function total(): Promise<int> {
      let result: int = 0;
      for await (const row of rows()) {
        result += row;
      }
      return result;
    }
  `);

  assert.match(source, /await foreach/);
  assert.doesNotMatch(source, /Task<[^>]*Generator/);
});

test("for await closes an async iterator on early break", () => {
  const source = compileAsyncIteration(`
    import type { int } from "@tsonic/csharp/types.js";
    async function* rows(): AsyncGenerator<int, string, unknown> {
      try {
        yield 1;
        yield 2;
      } finally {
        const closed: int = 1;
        void closed;
      }
      return "done";
    }
    export async function first(): Promise<int> {
      for await (const row of rows()) {
        return row;
      }
      return 0;
    }
  `);

  assert.match(source, /await foreach/);
  assert.match(source, /finally/);
});

test("for await preserves destructuring and exact selected element types", () => {
  const source = compileAsyncIteration(`
    import type { int } from "@tsonic/csharp/types.js";
    async function* rows(): AsyncGenerator<[string, int], void, unknown> {
      yield ["one", 1];
    }
    export async function total(): Promise<int> {
      let result: int = 0;
      for await (const [name, value] of rows()) {
        if (name.Length > 0) result += value;
      }
      return result;
    }
  `);

  assert.match(source, /await foreach/);
  assert.match(source, /string name/);
  assert.match(source, /int value/);
});

test("for await supports arrays through the retained array-to-async adaptation mechanism", () => {
  const source = compileAsyncIteration(`
    import type { int } from "@tsonic/csharp/types.js";
    export async function total(values: int[]): Promise<int> {
      let result: int = 0;
      for await (const value of values) {
        result += value;
      }
      return result;
    }
  `);

  assert.match(source, /await foreach/);
  assert.match(source, /int\[\] values/);
});

test("for await preserves source string code-point iteration", () => {
  const source = compileAsyncIteration(`
    export async function join(): Promise<string> {
      let result = "";
      for await (const value of "😀a") {
        result += value;
      }
      return result;
    }
  `);

  assert.match(source, /IsHighSurrogate/);
  assert.match(source, /IsLowSurrogate/);
  assert.match(source, /Substring/);
});
