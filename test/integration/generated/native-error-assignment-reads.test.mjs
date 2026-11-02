import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`native Error assignment bindings keep aliases, defaults, nested extraction and order (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let trace = "";
      function select(error: Error): Error { trace += "R"; return error; }
      function fallback(): string { trace += "D"; return "absent"; }
      export function run(error: Error): boolean {
        trace = "";
        let label = "";
        let message = "";
        let stack = "";
        const alias = error;
        const result = ({ name: label, message, stack = fallback() } = select(alias));
        return result === error && alias === error && trace === "RD" && label === error.name &&
          message === error.message && stack === "absent";
      }
      function nested(value: { error: Error }): string {
        let message = "";
        ({ error: { message } } = value);
        return message;
      }
      export function nestedRun(error: Error): boolean {
        let label = "";
        const values: Error[] = [error];
        [{ name: label }] = values;
        const pair: [string, Error] = ["prefix", error];
        let message = "";
        [, { message }] = pair;
        return nested({ error }) === error.message && message === error.message && label === error.name;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-assignment-read-${surface ?? "native"}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var original = new InvalidOperationException("native failure");
if (!Generated.run(original) || !Generated.nestedRun(original))
    throw new Exception("native assignment values, identity or order");
var explicitBuiltin = new Tsonic.CSharp.Runtime.Error("explicit builtin");
explicitBuiltin.name = "AuthoredBuiltin";
if (!Generated.run(explicitBuiltin) || !Generated.nestedRun(explicitBuiltin))
    throw new Exception("explicit builtin assignment observation");
`);
  });

  test(`native Error assignment reads match direct native allocation (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function name(error: Error): string { let name = ""; ({ name } = error); return name; }
      export function message(error: Error): string { let message = ""; ({ message } = error); return message; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-assignment-cost-${surface ?? "native"}`, false, false, [], `
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
        throw new Exception("native assignment values");
}
var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
if (allocated != 0) throw new Exception($"native assignment allocation: {allocated}");
`);
  });

  test(`non-Error own message assignment bindings retain mutable project storage (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Plain { message: string = "before"; }
      export function run(): boolean {
        const original = new Plain();
        const alias = original;
        let before = "";
        let after = "";
        ({ message: before } = alias);
        alias.message = "after";
        ({ message: after } = original);
        return alias === original && before === "before" && after === "after";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-assignment-project-${surface ?? "native"}`);
  });
}
