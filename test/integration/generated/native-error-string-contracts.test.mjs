import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const label = surface ?? "native";
  test(`native Error String, template, selected toString and console retain native diagnostics and once-only order (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let order: string = "";
      function selected(value: Error, key: string): Error { order += key; return value; }
      export function string(value: Error): string { return String(value); }
      export function template(value: Error): string { return \`prefix:\${value}:suffix\`; }
      export function method(value: Error): string { return value.toString(); }
      export function log(value: Error): void { console.log(value); }
      export function ordered(value: Error): string {
        order = "";
        const first = String(selected(value, "string;"));
        const second = \`\${selected(value, "template;")}\`;
        const third = selected(value, "method;").toString();
        console.log(selected(value, "console;"));
        return first + "|" + second + "|" + third;
      }
      export function orderValue(): string { return order; }
      export class ProjectFailure extends Error { toString(): string { return "project override"; } }
      export function ownMethod(value: ProjectFailure): string { return value.toString(); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /ErrorObject|Tsonic\.CSharp\.Runtime\.Error\b|System\.Reflection/u);
    executeCsharpConstruction(compiled, `native-error-string-contracts-${label}`, false, false, [], `
using System;
using System.IO;
using Generated = Tsonic.Generated.Index;
var cause = new Exception("cause");
var value = new InvalidOperationException("native message", cause);
var expected = value.ToString();
if (Generated.@string(value) != expected || Generated.template(value) != "prefix:" + expected + ":suffix" ||
    Generated.method(value) != expected || value.StackTrace is not null) throw new Exception("native string semantics before throw");
try { throw value; } catch (InvalidOperationException caught) {
    if (!ReferenceEquals(caught, value)) throw new Exception("native string throw identity");
}
expected = value.ToString();
if (Generated.@string(value) != expected || Generated.method(value) != expected || value.StackTrace is null)
    throw new Exception("native string semantics after throw");
var output = new StringWriter();
var previous = Console.Out;
try {
    Console.SetOut(output);
    if (Generated.ordered(value) != expected + "|" + expected + "|" + expected ||
        Generated.orderValue() != "string;template;method;console;") throw new Exception("one evaluation in source order");
} finally { Console.SetOut(previous); }
if (output.ToString() != expected + Environment.NewLine) throw new Exception("console native Exception diagnostic");
var project = new Tsonic.Generated.ProjectFailure("project message");
if (Generated.ownMethod(project) != "project override") throw new Exception("selected project override");
var nativeOverride = new OverrideFailure();
if (Generated.@string(nativeOverride) != "native override" || Generated.method(nativeOverride) != "native override" ||
    Generated.template(nativeOverride) != "prefix:native override:suffix") throw new Exception("native virtual override");
if (!ReferenceEquals(value.InnerException, cause)) throw new Exception("native cause identity");

sealed class OverrideFailure : Exception {
    public override string ToString() => "native override";
}
`);
  });

  test(`native Error formatting has exact handwritten allocation only on the requested diagnostic operation (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function method(value: Error): string { return value.toString(); }
      export function string(value: Error): string { return String(value); }
      export function template(value: Error): string { return \`prefix:\${value}:suffix\`; }
      export function log(value: Error): void { console.log(value); }
      export function construct(message: string): Error { return new Error(message); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-string-cost-${label}`, false, false, [], `
using System;
using System.IO;
using Generated = Tsonic.Generated.Index;
var value = new InvalidOperationException("native message");
Check(() => GC.KeepAlive(Generated.method(value)), () => GC.KeepAlive(value.ToString()), "method");
Check(() => GC.KeepAlive(Generated.@string(value)), () => GC.KeepAlive(value.ToString()), "String");
Check(() => GC.KeepAlive(Generated.template(value)), () => GC.KeepAlive($"prefix:{value}:suffix"), "template");
var previous = Console.Out;
try {
    Console.SetOut(TextWriter.Null);
    Check(() => Generated.log(value), () => Tsonic.CSharp.Js.console.log(value), "explicit console operation");
} finally { Console.SetOut(previous); }
Check(() => GC.KeepAlive(Generated.construct("message")), () => GC.KeepAlive(new Exception("message")), "ordinary construction");
if (value.StackTrace is not null) throw new Exception("formatting invented stack capture");

static void Check(Action actual, Action reference, string label) {
    for (var index = 0; index < 1024; index++) { actual(); reference(); }
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 4096; index++) actual();
    var actualBytes = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 4096; index++) reference();
    var referenceBytes = GC.GetAllocatedBytesForCurrentThread() - before;
    if (actualBytes != referenceBytes) throw new Exception($"{label}: {actualBytes} != {referenceBytes}");
}
`);
  });
}
