import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

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

  const firstRegistration = source.indexOf("Resource first =");
  const secondRegistration = source.indexOf("Resource second =");
  assert.notEqual(firstRegistration, -1);
  assert.notEqual(secondRegistration, -1);
  assert.equal(firstRegistration < secondRegistration, true);
  assert.equal((source.match(/\.Dispose\(\)/gu) ?? []).length, 2);
  assert.doesNotMatch(source, /ResourceStack|DisposeAndThrow|Add<Resource>/u);
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

  assert.match(source, /active is Resource __tsonic_param\d+/u);
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

  assert.match(source, /new Tsonic\.CSharp\.Runtime\.SuppressedError/u);
  assert.doesNotMatch(source, /ResourceStack|DisposeAndThrow/u);
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

  const firstRegistration = source.indexOf("Resource first =");
  const secondAcquisition = source.indexOf("Resource second = global::Tsonic.Generated.Index.fail()");
  assert.notEqual(firstRegistration, -1);
  assert.notEqual(secondAcquisition, -1);
  assert.equal(firstRegistration < secondAcquisition, true);
  assert.match(source, /second is Resource __tsonic_param\d+/u);
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

  assert.match(source, /active is AsyncResource __tsonic_param\d+/u);
  assert.doesNotMatch(source, /ResourceStack|AddAsync|DisposeAndThrow|async \(AsyncResource/u);
  assert.match(source, /\.DisposeAsync\(\)/);
  assert.match(source, /await __tsonic_param\d+\.DisposeAsync\(\)/u);
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

  assert.match(source, /resource is Resource __tsonic_param\d+/u);
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

  assert.doesNotMatch(source, /ResourceStack|AddAsync|DisposeAndThrow|async \(Tsonic\.CSharp\.Runtime\.Union/u);
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
  assert.match(source, /resource is Resource __tsonic_param\d+/u);
  assert.match(source, /finally/u);
  assert.match(source, /\.Dispose\(\)/u);
  assert.doesNotMatch(source, /ResourceStack|DisposeAndThrow/u);
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
  assert.match(source, /resource is AsyncResource __tsonic_param\d+/u);
  assert.match(source, /await __tsonic_param\d+\.DisposeAsync\(\)/u);
  assert.doesNotMatch(source, /ResourceStack|AddAsync|DisposeAndThrow/u);
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

  const registration = source.indexOf("Resource resource =");
  const disposal = source.indexOf(".Dispose()", registration);
  assert.equal(registration >= 0 && registration < disposal, true);
  assert.doesNotMatch(source, /for\s*\(\s*;\s*false\s*;\s*\)/u);
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
  assert.match(source, /resource is Resource __tsonic_param\d+/u);
  assert.match(source, /__tsonic_param\d+\.Dispose\(\)/u);
  assert.doesNotMatch(source, /ResourceStack|Add<Resource>|=> .*\.Dispose\(\)/u);
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
  assert.match(source, /resource is AsyncResource __tsonic_param\d+/u);
  assert.match(source, /await __tsonic_param\d+\.DisposeAsync\(\)/u);
  assert.doesNotMatch(source, /ResourceStack|AddAsync|DisposeAndThrow/u);
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

  assert.match(source, /active is not null/u);
  assert.doesNotMatch(source, /ResourceStack|Add<Tsonic\.CSharp\.Runtime\.Union/u);
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

for (const surface of [undefined, "js"]) {
  test(`native lexical disposal preserves completion identity and zero success-path allocation on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { Exception } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/csharp/types.js";
let events = "";
export const bodyFailure = new Exception("body");
export const firstFailure = new Exception("first");
export const secondFailure = new Exception("second");
class Resource {
  constructor(private id: string, private failing: boolean) {}
  [Symbol.dispose](): void {
    if (this.id === "0") return;
    events += this.id;
    if (this.failing) throw this.id === "1" ? firstFailure : secondFailure;
  }
}
export function create(): Resource { return new Resource("0", false); }
export function use(resource: Resource): void { using active = resource; void active; }
export function order(): string {
  events = "";
  { using first = new Resource("1", false); using second = new Resource("2", false); void first; void second; }
  return events;
}
export function failure(): void {
  events = "";
  using first = new Resource("1", true);
  using second = new Resource("2", true);
  void first; void second;
  throw bodyFailure;
}
function acquire(): Resource { throw bodyFailure; }
export function acquisition(): void {
  events = "";
  using first = new Resource("1", false);
  using second = acquire();
  void first; void second;
}
export function read(): string { return events; }
export function absent(resource: Resource | null | undefined): string {
  events = "";
  using missing = resource; void missing;
  return events;
}
function returning(): int { using active = new Resource("1", false); void active; return 7; }
export function paths(): boolean {
  events = "";
  if (returning() !== 7 || read() !== "1") return false;
  events = "";
  for (let index: int = 0; index < 2; index++) {
    using active = new Resource("1", false); void active;
    if (index === 0) continue;
    break;
  }
  if (read() !== "11") return false;
  events = "";
  for (using active = new Resource("1", false); false;) { void active; }
  if (read() !== "1") return false;
  events = "";
  for (using active of [new Resource("1", false), new Resource("2", false)]) { void active; }
  return read() === "12";
}
export function hoisted(): boolean {
  const before = answer();
  using active = new Resource("0", false); void active;
  const after: int = 11;
  function answer(): int { return 17; }
  function captured(): int { return after; }
  return before === 17 && captured() === 11;
}
` });
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /ResourceStack|DisposeAndThrow|AddAsync</u);
    executeCsharpConstruction(compiled, `native-lexical-disposal-${surface ?? "native"}`, false, false, [], `
using System;
using Tsonic.CSharp.Runtime;
using Index = Tsonic.Generated.Index;
if (Index.order() != "21" || Index.absent(null) != "" || !Index.paths() || !Index.hoisted())
    throw new Exception("native disposal completion/order/absence/hoisting");
try { Index.failure(); throw new Exception("missing disposal failure"); }
catch (SuppressedError outer)
{
    if (!ReferenceEquals(outer.Error, Index.firstFailure) ||
        outer.Suppressed is not SuppressedError inner ||
        !ReferenceEquals(inner.Error, Index.secondFailure) ||
        !ReferenceEquals(inner.Suppressed, Index.bodyFailure) || Index.read() != "21")
        throw new Exception("native suppression identity/order");
}
try { Index.acquisition(); throw new Exception("missing acquisition failure"); }
catch (Exception error)
{
    if (!ReferenceEquals(error, Index.bodyFailure) || Index.read() != "1")
        throw new Exception("native acquisition identity/order");
}
var resource = Index.create();
for (var iteration = 0; iteration < 10000; iteration++) { Index.use(resource); Native(); }
var before = GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 4096; iteration++) Index.use(resource);
var actual = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 4096; iteration++) Native();
var reference = GC.GetAllocatedBytesForCurrentThread() - before;
if (actual != reference || actual != 0)
    throw new Exception($"native disposal allocation {actual} != {reference}");
void Native() { try {} finally { resource.Dispose(); } }
`);
  });

  test(`native async lexical disposal awaits reverse order and synchronous fallbacks on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let events = "";
function read(): string { return events; }
class SyncResource { [Symbol.dispose](): void { events += "s"; } }
class AsyncResource {
  async [Symbol.asyncDispose](): Promise<void> { await Promise.resolve(undefined); events += "a"; }
}
async function consume(resource: SyncResource | AsyncResource): Promise<void> {
  await using active = resource; void active;
}
export async function run(): Promise<boolean> {
  events = "";
  { using first = new SyncResource(); await using second = new AsyncResource(); void first; void second; }
  if (read() !== "as") return false;
  events = "";
  await consume(new SyncResource());
  await consume(new AsyncResource());
  return read() === "sa";
}
` });
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /ResourceStack|DisposeAndThrow|AddAsync</u);
    executeCsharpConstruction(compiled, `native-async-lexical-disposal-${surface ?? "native"}`, true);
  });
}

for (const surface of [undefined, "js"]) {
  test(`native zero-iteration for guards preserve calls, sequence effects and failure identity on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { Exception } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/csharp/types.js";
let evaluations: int = 0;
let disposed: int = 0;
let entered: int = 0;
const failure = new Exception("condition");
class Resource { [Symbol.dispose](): void { disposed++; } }
function count(): int { return evaluations; }
function disposedCount(): int { return disposed; }
function enteredCount(): int { return entered; }
function reject(): false {
  evaluations++;
  if (count() === 3) throw failure;
  return false;
}
export function run(): boolean {
  for (using active = new Resource(); reject();) { entered++; void active; }
  if (count() !== 1 || disposedCount() !== 1 || enteredCount() !== 0) return false;
  for (using active = new Resource(); (evaluations++, false);) { entered++; void active; }
  if (count() !== 2 || disposedCount() !== 2 || enteredCount() !== 0) return false;
  try {
    for (using active = new Resource(); reject();) { entered++; void active; }
    return false;
  } catch (caught) {
    return count() === 3 && disposedCount() === 3 && enteredCount() === 0 && caught === failure;
  }
}
` });
    const source = compiled.artifacts.get("src/Index.cs") ?? "";
    assert.doesNotMatch(source, /for\s*\(\s*;\s*false\s*;\s*\)/u);
    executeCsharpConstruction(compiled, `native-zero-iteration-guard-effects-${surface ?? "native"}`);
  });
}
