import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

function compileResourceManagement(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled.artifacts.get("src/Index.cs") ?? "";
}

const resourceClass = `
  class Resource {
    disposed = false;
    [Symbol.dispose](): void {
      this.disposed = true;
    }
  }
`;

test("using disposes a resource on normal lexical scope exit", () => {
  const source = compileResourceManagement(`
    ${resourceClass}
    export function run(): boolean {
      const resource = new Resource();
      {
        using active = resource;
        void active;
      }
      return resource.disposed;
    }
  `);

  assert.match(source, /try/);
  assert.match(source, /finally/);
  assert.match(source, /\.Dispose\(\)/);
});

test("multiple using declarations dispose in reverse acquisition order", () => {
  const source = compileResourceManagement(`
    ${resourceClass}
    export function run(): void {
      using first = new Resource();
      using second = new Resource();
      void first;
      void second;
    }
  `);

  const secondDisposal = source.indexOf("second.Dispose()");
  const firstDisposal = source.indexOf("first.Dispose()");
  assert.notEqual(secondDisposal, -1);
  assert.notEqual(firstDisposal, -1);
  assert.equal(secondDisposal < firstDisposal, true);
});

test("using disposes across return throw break and continue completion paths", () => {
  const source = compileResourceManagement(`
    import type { int } from "@tsonic/csharp/types.js";
    ${resourceClass}
    export function returnPath(): int {
      using resource = new Resource();
      return resource.disposed ? 0 : 1;
    }
    export function throwPath(): void {
      using resource = new Resource();
      throw new Error(resource.disposed ? "early" : "body");
    }
    export function loopPath(): void {
      for (let index: int = 0; index < 2; index += 1) {
        using resource = new Resource();
        if (index === 0) continue;
        break;
      }
    }
  `);

  assert.equal((source.match(/finally/g) ?? []).length >= 3, true);
  assert.equal((source.match(/\.Dispose\(\)/g) ?? []).length >= 3, true);
});

test("using treats null and undefined resources as disposal no-ops", () => {
  const source = compileResourceManagement(`
    ${resourceClass}
    export function run(resource: Resource | null | undefined): void {
      using active = resource;
      void active;
    }
  `);

  assert.match(source, /active is not null/);
  assert.match(source, /\.Dispose\(\)/);
});

test("using composes body and disposer failures through SuppressedError", () => {
  const source = compileResourceManagement(`
    import { Exception } from "@tsonic/dotnet/System.js";
    class FailingResource {
      [Symbol.dispose](): void {
        throw new Exception("dispose");
      }
    }
    export function run(): void {
      using resource = new FailingResource();
      void resource;
      throw new Exception("body");
    }
  `);

  assert.match(source, /Tsonic\.CSharp\.Runtime\.SuppressedError/);
  assert.match(source, /catch \(System\.Exception/);
  assert.match(source, /finally/);
});

test("failed later acquisition disposes every successfully acquired resource", () => {
  const source = compileResourceManagement(`
    import { Exception } from "@tsonic/dotnet/System.js";
    ${resourceClass}
    function fail(): Resource {
      throw new Exception("acquire");
    }
    export function run(): void {
      using first = new Resource();
      using second = fail();
      void first;
      void second;
    }
  `);

  assert.match(source, /first\.Dispose\(\)/);
  assert.match(source, /second\.Dispose\(\)/);
  assert.match(source, /try/);
});

test("await using awaits exact async disposal on every completion path", () => {
  const source = compileResourceManagement(`
    class AsyncResource {
      disposed = false;
      async [Symbol.asyncDispose](): Promise<void> {
        this.disposed = true;
      }
    }
    export async function run(): Promise<boolean> {
      const resource = new AsyncResource();
      {
        await using active = resource;
        void active;
      }
      return resource.disposed;
    }
  `);

  assert.match(source, /await .*\.DisposeAsync\(\)/);
  assert.match(source, /finally/);
});

test("await using accepts the exact synchronous-disposer fallback", () => {
  const source = compileResourceManagement(`
    ${resourceClass}
    export async function run(): Promise<void> {
      await using resource = new Resource();
      void resource;
    }
  `);

  assert.match(source, /resource\.Dispose\(\)/);
  assert.doesNotMatch(source, /resource\.DisposeAsync\(\)/);
});

test("using declarations in for-of bindings dispose once per iteration", () => {
  const source = compileResourceManagement(`
    ${resourceClass}
    export function run(resources: Resource[]): void {
      for (using resource of resources) {
        void resource;
      }
    }
  `);

  assert.match(source, /foreach/);
  assert.match(source, /finally/);
  assert.match(source, /resource\.Dispose\(\)/);
});

test("generator-owned using resources live until generator closure", () => {
  const source = compileResourceManagement(`
    import type { int } from "@tsonic/csharp/types.js";
    ${resourceClass}
    export function* values(): Generator<int, void, unknown> {
      using resource = new Resource();
      yield 1;
      void resource;
    }
  `);

  assert.match(source, /yield return/);
  assert.match(source, /finally/);
  assert.match(source, /resource\.Dispose\(\)/);
});
