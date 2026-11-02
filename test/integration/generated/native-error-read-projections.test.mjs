import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const label = surface ?? "native";
  test(`native Error assignment destructuring shares declaration reads, defaults, order and identity (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Failure extends Error { detail: string = "own"; }
      let order: string = "";
      function selected(value: Failure): Failure { order += "source;"; return value; }
      function fallback(): string { order += "default;"; return "missing"; }
      export function run(): boolean {
        const originalCause = new Error("cause");
        const original = new Failure("message", { cause: originalCause });
        const alias = original;
        let name: string = "";
        let message: string = "";
        let trace: string = "";
        let cause: Error | undefined;
        let detail: string = "";
        ({ name, message, stack: trace = fallback(), cause, detail } = selected(alias));
        const { name: declaredName, message: declaredMessage, cause: declaredCause } = original;
        alias.detail = "changed";
        return name === "Failure" && message === "message" && trace === "missing" && cause === originalCause &&
          detail === "own" && order === "source;default;" && declaredName === name && declaredMessage === message &&
          declaredCause === cause && original.detail === "changed" && alias === original;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /ErrorObject|Tsonic\.CSharp\.Runtime\.Error\b/u);
    executeCsharpConstruction(compiled, `native-error-assignment-read-${label}`);
  });

  test(`native Error readonly forwarding reads inherited native members without a wrapper or copied instance (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      interface NativeView { readonly name: string; readonly message: string; readonly detail: string; }
      class Failure extends Error { detail: string = "own"; }
      export function view(value: Failure): NativeView { return value; }
      export function make(): Failure { return new Failure("message"); }
      export function run(): boolean {
        const original = new Failure("message");
        const retained = view(original);
        if (retained.name !== "Failure" || retained.message !== "message" || retained.detail !== "own") return false;
        original.detail = "changed";
        return retained.detail === "changed" && retained === original && original.stack === undefined;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /this\.message\b|this\.name\b|ErrorObject|Tsonic\.CSharp\.Runtime\.Error\b|<out /u);
    executeCsharpConstruction(compiled, `native-error-readonly-view-${label}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
if (!Generated.run()) throw new Exception("native readonly property forwarding");
var original = Generated.make();
for (var index = 0; index < 1024; index++) GC.KeepAlive(Generated.view(original));
var before = GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 4096; index++) GC.KeepAlive(Generated.view(original));
var actual = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 4096; index++) GC.KeepAlive((Tsonic.Generated.NativeView)original);
var reference = GC.GetAllocatedBytesForCurrentThread() - before;
if (actual != reference || !ReferenceEquals(Generated.view(original), original))
    throw new Exception($"native forwarding allocation or identity {actual} != {reference}");
`);
  });

  test(`native Error literal own project storage remains readable without blanket literal-key refusal (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Failure extends Error { code: number = 17; }
      export function run(): boolean {
        const value = new Failure("original");
        return value["code"] === 17 && value.message === "original" && value.stack === undefined;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-own-literal-${label}`);
  });

  test(`native Error runtime-union narrowing keeps inherited native property reads and subtype identity (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class First extends Error { first: string = "first"; }
      class Second extends Error { second: string = "second"; }
      function read(value: First | Second): string {
        if (value instanceof First) return value.message + value.first;
        return value.message + value.second;
      }
      export function run(): boolean {
        const first = new First("one");
        const second = new Second("two");
        return read(first) === "onefirst" && read(second) === "twosecond" &&
          first.stack === undefined && second.stack === undefined;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-narrowed-read-${label}`);
  });
}
