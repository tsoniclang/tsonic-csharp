import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const header = `
  import { attribute as annotate } from "@tsonic/core/lang.js";
  import type { int32 } from "@tsonic/core/types.js";
  import { AttributeTargets, AttributeUsageAttribute, Int32, ObsoleteAttribute, String as NativeString } from "@tsonic/dotnet/System.js";
  import { DebuggerBrowsableAttribute, DebuggerBrowsableState, DebuggerDisplayAttribute } from "@tsonic/dotnet/System.Diagnostics.js";
  import { MemberNotNullAttribute } from "@tsonic/dotnet/System.Diagnostics.CodeAnalysis.js";
  import { TupleElementNamesAttribute } from "@tsonic/dotnet/System.Runtime.CompilerServices.js";
  import { FieldOffsetAttribute } from "@tsonic/dotnet/System.Runtime.InteropServices.js";
  export class Subject { value: int32 = 0; run(): void {} }
`;

function emittedCsharp(compiled) {
  return [...compiled.artifacts.entries()].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
}

test("C# admits constant attribute arguments selected as literals, .NET literal fields, native operators and arrays", () => {
  const compiled = compileCsharpSource({ sourceText: header + `
    annotate<Subject>().add(() => new ObsoleteAttribute("old", true));
    annotate<Subject>().add(() => new ObsoleteAttribute(\`template\`));
    annotate<Subject>().add(() => new ObsoleteAttribute("a" + "b"));
    annotate<Subject>().add(() => new ObsoleteAttribute(true ? "c" : "d", !false));
    annotate<Subject>().add(() => new AttributeUsageAttribute(AttributeTargets.Class | AttributeTargets.Method));
    annotate<Subject>().add(() => new TupleElementNamesAttribute(["e", "f"]));
    annotate<Subject>().add(() => new MemberNotNullAttribute("g", "h"));
    annotate<Subject>().property(subject => subject.value).target("field").add(() => new DebuggerBrowsableAttribute(DebuggerBrowsableState.Never));
    annotate<Subject>().property(subject => subject.value).target("field").add(() => new FieldOffsetAttribute(Int32.MaxValue - 1));
    annotate<Subject>().method(subject => subject.run).add(() => new FieldOffsetAttribute(-1));
    annotate<Subject>().method(subject => subject.run).add(() => new FieldOffsetAttribute((4 as int32)));
    annotate<Subject>().method(subject => subject.run).add(() => new FieldOffsetAttribute(Int32.MaxValue));
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const output = emittedCsharp(compiled);
  for (const expected of [
    '[System.ObsoleteAttribute("old", true)]',
    '[System.ObsoleteAttribute("template")]',
    '[System.ObsoleteAttribute("a" + "b")]',
    '[System.ObsoleteAttribute(true ? "c" : "d", !false)]',
    "[System.AttributeUsageAttribute(System.AttributeTargets.Class | System.AttributeTargets.Method)]",
    '[System.Runtime.CompilerServices.TupleElementNamesAttribute(new string?[] { "e", "f" })]',
    '[System.Diagnostics.CodeAnalysis.MemberNotNullAttribute("g", "h")]',
    "[field: System.Diagnostics.DebuggerBrowsableAttribute(System.Diagnostics.DebuggerBrowsableState.Never)]",
    "[field: System.Runtime.InteropServices.FieldOffsetAttribute(System.Int32.MaxValue - 1)]",
    "[System.Runtime.InteropServices.FieldOffsetAttribute(-1)]",
    "[System.Runtime.InteropServices.FieldOffsetAttribute((4))]",
    "[System.Runtime.InteropServices.FieldOffsetAttribute(System.Int32.MaxValue)]",
  ]) {
    assert.ok(output.includes(expected), expected);
  }
});

for (const [name, application, argument] of [
  ["a .NET static readonly field", "annotate<Subject>().add(() => new ObsoleteAttribute(NativeString.Empty));", 1],
  ["an immediately invoked lambda", 'annotate<Subject>().add(() => new ObsoleteAttribute((() => "x")()));', 1],
  ["a .NET method call", 'annotate<Subject>().add(() => new DebuggerDisplayAttribute(NativeString.Concat("not ", "constant")));', 1],
  ["a module const binding", 'const message = "x"; annotate<Subject>().add(() => new ObsoleteAttribute(message));', 1],
  ["a type assertion that changes the resolved type", "annotate<Subject>().add(() => new ObsoleteAttribute(null as unknown as string));", 1],
]) {
  test(`C# rejects ${name} as an attribute argument before publication`, () => {
    const compiled = compileCsharpSource({ sourceText: header + application });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.extensionDiagnostics, []);
    const attributeDiagnostics = compiled.targetDiagnostics.filter(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION");
    assert.equal(attributeDiagnostics.length, 1, JSON.stringify(compiled.targetDiagnostics));
    assert.match(attributeDiagnostics[0].message, new RegExp(`^C# attribute application argument ${argument} `, "u"));
    assert.equal(compiled.result.program, undefined);
    assert.equal(compiled.result.plan, undefined);
    assert.deepEqual(compiled.result.artifacts, []);
  });
}
