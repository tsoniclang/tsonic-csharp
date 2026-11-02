import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`selected native Error declaration bindings keep defaults, aliases and evaluation order (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let trace = "";
      function select(error: Error): Error { trace += "R"; return error; }
      function fallback(): string { trace += "D"; return "absent"; }
      export function run(error: Error): boolean {
        trace = "";
        const alias = error;
        const { name: label, message, stack = fallback() } = select(alias);
        return alias === error && trace === "RD" && label === error.name && message === error.message && stack === "absent";
      }
      export function parameter({ name: label, message, stack = "absent" }: Error): string {
        return label + "|" + message + "|" + stack;
      }
      export function nested(value: { error: Error }): string {
        const { error: { message } } = value;
        return message;
      }
      export function nestedRun(error: Error): boolean { return nested({ error }) === error.message; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-binding-read-${surface ?? "native"}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var original = new InvalidOperationException("native failure");
if (!Generated.run(original) || !Generated.nestedRun(original) || Generated.parameter(original) != "InvalidOperationException|native failure|absent")
    throw new Exception("native declaration bindings");
var explicitBuiltin = new Tsonic.CSharp.Runtime.Error("explicit builtin");
explicitBuiltin.name = "AuthoredBuiltin";
if (!Generated.run(explicitBuiltin) || Generated.parameter(explicitBuiltin) != "AuthoredBuiltin|explicit builtin|absent")
    throw new Exception("explicit builtin observation");
`);
  });

  test(`native Error declaration bindings add no allocation to direct native observations (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function name(error: Error): string { const { name } = error; return name; }
      export function message(error: Error): string { const { message } = error; return message; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-binding-cost-${surface ?? "native"}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var original = new InvalidOperationException("native failure");
for (var index = 0; index < 1024; index++) {
    GC.KeepAlive(Generated.name(original)); GC.KeepAlive(Generated.message(original));
    GC.KeepAlive(original.GetType().Name); GC.KeepAlive(original.Message);
}
var before = GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 4096; index++) {
    if (Generated.name(original) != original.GetType().Name || Generated.message(original) != original.Message)
        throw new Exception("native binding values");
}
var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
if (allocated != 0) throw new Exception($"native binding allocation: {allocated}");
`);
  });

  test(`ordinary own message bindings retain project storage and mutation (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Plain { message: string = "before"; }
      export function run(): boolean {
        const original = new Plain();
        const alias = original;
        const { message: before } = alias;
        alias.message = "after";
        const { message: after } = original;
        return alias === original && before === "before" && after === "after";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-binding-project-${surface ?? "native"}`);
  });
}
