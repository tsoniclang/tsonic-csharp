import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["js"]) {
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

test("native Error template conversion retains Exception diagnostics, order", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "native", sourceText: `
    let evaluations: number = 0;
    function selected(value: Error): Error { evaluations += 1; return value; }
    export function template(value: Error): string { return \`prefix:\${selected(value)}:suffix\`; }
    export function count(): number { return evaluations; }
    export function construct(message: string): Error { return new Error(message); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "native-error-template-contract", false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var cause = new Exception("cause");
var value = new InvalidOperationException("message", cause);
if (Generated.template(value) != $"prefix:{value}:suffix" || Generated.count() != 1 || value.StackTrace is not null)
    throw new Exception("native template first observation or one evaluation");
try { throw value; } catch (InvalidOperationException caught) {
    if (!ReferenceEquals(caught, value)) throw new Exception("native template throw identity");
}
if (Generated.template(value) != $"prefix:{value}:suffix" || Generated.count() != 2 || value.StackTrace is null ||
    !ReferenceEquals(value.InnerException, cause)) throw new Exception("native template after throw");
var generatedCount = Generated.count();
var nativeCount = Tsonic.Reference.Index.count();
Exercise(() => GC.KeepAlive(Generated.template(value)), () => GC.KeepAlive(Tsonic.Reference.Index.template(value)));
if (Generated.count() - generatedCount != Tsonic.Reference.Index.count() - nativeCount)
    throw new Exception("native template argument evaluation count");
Check(() => GC.KeepAlive(Generated.construct("message")), () => GC.KeepAlive(new Exception("message")), "ordinary construction");
static void Exercise(Action actual, Action reference) {
    for (var index = 0; index < 1024; index++) { actual(); reference(); }
    const int count = 4096;
    Invoke(actual, count);
    Invoke(reference, count);
    Invoke(actual, 2 * count);
    Invoke(reference, 2 * count);
    Invoke(reference, count);
    Invoke(actual, count);
    Invoke(reference, 2 * count);
    Invoke(actual, 2 * count);
}
static void Invoke(Action action, int count) {
    for (var index = 0; index < count; index++) action();
}
static void Check(Action actual, Action reference, string label) {
    for (var index = 0; index < 1024; index++) { actual(); reference(); }
    const int count = 4096;
    var actualBytes = Measure(actual, count);
    var nativeBytes = Measure(reference, count);
    var actualDoubleBytes = Measure(actual, 2 * count);
    var nativeDoubleBytes = Measure(reference, 2 * count);
    var nativeFirstBytes = Measure(reference, count);
    var actualSecondBytes = Measure(actual, count);
    var nativeFirstDoubleBytes = Measure(reference, 2 * count);
    var actualSecondDoubleBytes = Measure(actual, 2 * count);
    var actualSlope = actualDoubleBytes - actualBytes;
    var nativeSlope = nativeDoubleBytes - nativeBytes;
    var actualReverseSlope = actualSecondDoubleBytes - actualSecondBytes;
    var nativeReverseSlope = nativeFirstDoubleBytes - nativeFirstBytes;
    Console.Error.WriteLine($"native {label} allocation forward={actualBytes}/{nativeBytes}, reverse={actualSecondBytes}/{nativeFirstBytes}");
    Console.Error.WriteLine($"native {label} allocation 2N={actualDoubleBytes}/{nativeDoubleBytes}, reverse2N={actualSecondDoubleBytes}/{nativeFirstDoubleBytes}");
    Console.Error.WriteLine($"native {label} allocation slopes forward={actualSlope}/{nativeSlope}, reverse={actualReverseSlope}/{nativeReverseSlope}");
    Console.Error.WriteLine($"native {label} allocation remainders forward={actualBytes - actualSlope}/{nativeBytes - nativeSlope}, reverse={actualSecondBytes - actualReverseSlope}/{nativeFirstBytes - nativeReverseSlope}");
    if (actualSlope != nativeSlope) throw new Exception($"native {label} allocation slope {actualSlope} != {nativeSlope}");
    if (actualReverseSlope != nativeReverseSlope) throw new Exception($"native {label} reversed allocation slope {actualReverseSlope} != {nativeReverseSlope}");
}
static long Measure(Action action, int count) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < count; index++) action();
    return GC.GetAllocatedBytesForCurrentThread() - before;
}
namespace Tsonic.Reference {
    public static class Index {
        private static double evaluations { get; set; }
        private static Exception selected(Exception value) { evaluations += 1; return value; }
        public static string template(Exception value) { return $"prefix:{selected(value)}:suffix"; }
        public static double count() { return evaluations; }
    }
}
`);
});
