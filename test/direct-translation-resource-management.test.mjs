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

  const firstRegistration = source.indexOf("Add<Resource>(first");
  const secondRegistration = source.indexOf("Add<Resource>(second");
  assert.notEqual(firstRegistration, -1);
  assert.notEqual(secondRegistration, -1);
  assert.equal(firstRegistration < secondRegistration, true);
  assert.match(source, /DisposeAndThrow/);
});

test("using disposes across return throw break and continue completion paths", () => {
  const source = compileResourceManagement(`
    import { Exception } from "@tsonic/dotnet/System.js";
    import type { int } from "@tsonic/csharp/types.js";
    ${resourceClass}
    export function returnPath(): int {
      using resource = new Resource();
      return resource.disposed ? 0 : 1;
    }
    export function throwPath(): void {
      using resource = new Resource();
      throw new Exception(resource.disposed ? "early" : "body");
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

  assert.match(source, /Add<Resource>\(active/);
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

  assert.match(source, /Tsonic\.CSharp\.Runtime\.ResourceStack/);
  assert.match(source, /DisposeAndThrow/);
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

  assert.equal(
    source.indexOf("Add<Resource>(first") < source.indexOf("Resource second = fail()"),
    true,
  );
  assert.match(source, /Add<Resource>\(second/);
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

  assert.match(source, /AddAsync<AsyncResource>/);
  assert.match(source, /async \(AsyncResource/);
  assert.match(source, /=> await .*\.DisposeAsync\(\)/);
  assert.match(source, /\.DisposeAsync\(\)/);
  assert.match(source, /await .*\.DisposeAndThrowAsync\(/);
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

  assert.match(source, /Add<Resource>\(resource/);
  assert.match(source, /\.Dispose\(\)/);
  assert.doesNotMatch(source, /AddAsync<Resource>/);
});

test("await using dispatches mixed exact runtime-union disposers", () => {
  const source = compileResourceManagement(`
    class SyncResource {
      [Symbol.dispose](): void {}
    }
    class AsyncResource {
      async [Symbol.asyncDispose](): Promise<void> {}
    }
    export async function run(
      resource: SyncResource | AsyncResource,
    ): Promise<void> {
      await using active = resource;
      void active;
    }
  `);

  assert.match(source, /AddAsync<Tsonic\.CSharp\.Runtime\.Union</);
  assert.match(source, /async \(Tsonic\.CSharp\.Runtime\.Union/);
  assert.match(source, /\.Dispose\(\)/);
  assert.match(source, /await .*\.DisposeAsync\(\)/);
});

test("top-level using is disposed at the end of module evaluation", () => {
  const source = compileResourceManagement(`
    ${resourceClass}
    using resource = new Resource();
    export const observed = resource.disposed;
  `);

  assert.match(source, /__tsonic_module_init_core/);
  assert.match(source, /ResourceStack/);
  assert.match(source, /Add<Resource>\(resource/);
  assert.match(source, /DisposeAndThrow/);
});

test("top-level await using makes executable module initialization asynchronous", () => {
  const compiled = compileCsharpSource({
    targetOptions: { outputType: "Exe" },
    sourceText: `
      class AsyncResource {
        async [Symbol.asyncDispose](): Promise<void> {}
      }
      await using resource = new AsyncResource();
      export const observed = resource;
    `,
  });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";

  assert.match(source, /private static async System\.Threading\.Tasks\.Task __tsonic_module_init_core/);
  assert.match(source, /AddAsync<AsyncResource>\(resource/);
  assert.match(source, /await .*\.DisposeAndThrowAsync/);
});

test("using in a for initializer is disposed after the complete loop", () => {
  const source = compileResourceManagement(`
    ${resourceClass}
    export function run(): void {
      for (using resource = new Resource(); false;) {
        void resource;
      }
    }
  `);

  const registration = source.indexOf("Add<Resource>(resource");
  const loop = source.indexOf("for (; false; )");
  const disposal = source.indexOf("DisposeAndThrow");
  assert.equal(registration >= 0 && registration < loop, true);
  assert.equal(loop < disposal, true);
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
  assert.match(source, /Add<Resource>\(resource/);
  assert.match(source, /=> .*\.Dispose\(\)/);
});

test("await using in for-await-of disposes each selected async resource", () => {
  const source = compileResourceManagement(`
    class AsyncResource {
      async [Symbol.asyncDispose](): Promise<void> {}
    }
    async function* resources(): AsyncGenerator<AsyncResource, void, unknown> {
      yield new AsyncResource();
    }
    export async function run(): Promise<void> {
      for await (await using resource of resources()) {
        void resource;
      }
    }
  `);

  assert.match(source, /await foreach \(AsyncResource resource/);
  assert.match(source, /AddAsync<AsyncResource>\(resource/);
  assert.match(source, /await .*\.DisposeAndThrowAsync/);
});

test("using dispatches exact runtime-union resource alternatives", () => {
  const source = compileResourceManagement(`
    class First {
      [Symbol.dispose](): void {}
    }
    class Second {
      [Symbol.dispose](): void {}
    }
    export function run(resource: First | Second | null): void {
      using active = resource;
      void active;
    }
  `);

  assert.match(source, /Add<Tsonic\.CSharp\.Runtime\.Union<First, Second,/);
  assert.match(source, /\.Is1\(\)/);
  assert.match(source, /\.As1\(\)\.Dispose\(\)/);
  assert.match(source, /\.Is2\(\)/);
  assert.match(source, /\.As2\(\)\.Dispose\(\)/);
});

test("generator-owned using fails closed at the native suppression boundary", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    ${resourceClass}
    export function* values(): Generator<int, void, unknown> {
      using resource = new Resource();
      yield 1;
      void resource;
    }
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.targetDiagnostics.length, 1);
  assert.equal(
    compiled.targetDiagnostics[0]?.code,
    "CSHARP_GENERATOR_RESOURCE_MANAGEMENT_NOT_PROVEN",
  );
});
