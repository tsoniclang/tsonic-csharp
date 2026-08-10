import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

function compileAsyncGenerator(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled.artifacts.get("src/Index.cs") ?? "";
}

test("async generators lower through native C# async iterators", () => {
  const source = compileAsyncGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    async function nextValue(): Promise<int> { return 1; }
    export async function* rows(): AsyncGenerator<int, string, unknown> {
      yield await nextValue();
      return "complete";
    }
  `);

  assert.match(source, /Tsonic\.CSharp\.Runtime\.AsyncGenerator<int, string,/);
  assert.match(source, /System\.Collections\.Generic\.IAsyncEnumerable</);
  assert.match(source, /async/);
  assert.match(source, /yield return await nextValue\(\)/);
});

test("async generator yield expressions receive exact queued next values", () => {
  const source = compileAsyncGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    async function first(): Promise<int> { return 1; }
    export async function* rows(): AsyncGenerator<int, string, int> {
      const command: int = yield await first();
      yield command;
      return "complete";
    }
  `);

  assert.match(source, /ConsumeNext\(\)/);
  assert.match(source, /IAsyncEnumerable/);
});

test("async generator protocol serializes concurrent requests in FIFO order", () => {
  const source = compileAsyncGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    export async function* rows(): AsyncGenerator<int, string, int> {
      const first: int = yield 0;
      const second: int = yield first;
      yield second;
      return "done";
    }
    export async function queued(): Promise<int> {
      const generator = rows();
      const first = generator.next();
      const second = generator.next(7);
      const third = generator.next(9);
      await first;
      await second;
      return (await third).value as int;
    }
  `);

  assert.match(source, /AsyncGenerator<int, string, int>/);
  assert.match(source, /\.NextAsync\(/);
  assert.match(source, /await/);
});

test("async generator return and throw commands preserve finally cleanup", () => {
  const source = compileAsyncGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    let closed = false;
    export async function* guarded(): AsyncGenerator<int, string, int> {
      try {
        const next: int = yield 1;
        yield next;
        return "normal";
      } finally {
        closed = true;
      }
    }
  `);

  assert.match(source, /try/);
  assert.match(source, /finally/);
  assert.match(source, /yield return/);
});

test("async yield star forwards sync and async delegated protocols", () => {
  const source = compileAsyncGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    function* syncRows(): Generator<int, string, int> {
      const next: int = yield 1;
      yield next;
      return "sync";
    }
    async function* asyncRows(): AsyncGenerator<int, string, int> {
      const next: int = yield 2;
      yield next;
      return "async";
    }
    export async function* allRows(): AsyncGenerator<int, string, int> {
      yield* syncRows();
      return yield* asyncRows();
    }
  `);

  assert.match(source, /\.Next(?:Async)?\(/);
  assert.match(source, /yield return/);
});

test("generic async generators preserve the exact next target type", () => {
  const source = compileAsyncGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    export async function* exchange<TNext>(
      initial: int,
      completed: string,
    ): AsyncGenerator<int, string, TNext> {
      const next: TNext = yield initial;
      void next;
      return completed;
    }
  `);

  assert.match(source, /AsyncGenerator<int, string, TNext>/);
  assert.match(source, /ConsumeNext\(\)/);
});

for (const [name, body] of [
  ["yield inside catch", `try { throw new Error("x"); } catch { yield 1; }`],
  ["yield inside finally", `try { return "done"; } finally { yield 1; }`],
  ["yield inside try with catch", `try { yield 1; } catch { return "caught"; }`],
]) {
  test(`async generators reject ${name} at the exact native boundary`, () => {
    const compiled = compileCsharpSource({
      sourceText: `
        import { Exception } from "@tsonic/dotnet/System.js";
        import type { int } from "@tsonic/csharp/types.js";
        export async function* unsupported(): AsyncGenerator<int, string, unknown> {
          ${body.replace('new Error("x")', 'new Exception("x")')}
          return "done";
        }
      `,
    });

    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.targetDiagnostics.length, 1);
    assert.equal(compiled.targetDiagnostics[0]?.code, "CSHARP_UNSUPPORTED_GENERATOR_SUSPENSION_REGION");
  });
}
