import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const header = `
  import { attribute as annotate } from "@tsonic/core/lang.js";
  import type { int32 } from "@tsonic/core/types.js";
  import { Attribute, AttributeTargets, AttributeUsageAttribute, Int32, ObsoleteAttribute, String as NativeString } from "@tsonic/dotnet/System.js";
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

for (const [name, expression] of [
  ["satisfies", '"old" satisfies string'],
  ["non-null", '"old"!'],
  ["type assertion", '<string>"old"'],
  ["const assertion", '"old" as const'],
]) {
  test(`C# attribute admission preserves the native constant under a ${name}`, () => {
    const compiled = compileCsharpSource({ sourceText: header + `
      annotate<Subject>().add(() => new ObsoleteAttribute(${expression}));
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.extensionDiagnostics, []);
    assert.deepEqual(compiled.targetDiagnostics, []);
    assert.ok(emittedCsharp(compiled).includes('[System.ObsoleteAttribute("old")]'));
  });
}

for (const [name, declarations, expression, parameter, expected] of [
  ["source enum member", "enum Level { Low = 0, High = 1 }", "Level.Low", "Level", "Level.Low"],
  ["wide source enum member", "enum Level { High = 9007199254740993 }", "Level.High", "Level", "Level.High"],
  ["native numeric cast", "", "1.9 as int32", "int32", "(int)1.9D"],
  ["native numeric promotion", "", "true ? Int32.MaxValue : 1.9", "number", "true ? System.Int32.MaxValue : 1.9D"],
]) {
  test(`C# attribute admission retains a ${name} rather than reselecting its carrier`, () => {
    const compiled = compileCsharpSource({ sourceText: header + declarations + `
      export class SelectedAttribute extends Attribute { constructor(value: ${parameter}) { super(); } }
      annotate<Subject>().add(() => new SelectedAttribute(${expression}));
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.extensionDiagnostics, []);
    assert.deepEqual(compiled.targetDiagnostics, []);
    assert.ok(emittedCsharp(compiled).includes(`[SelectedAttribute(${expected})]`));
  });
}

for (const expression of ["null", "undefined"]) {
  test(`C# attribute admission retains ${expression} as the one native absence constant`, () => {
    const compiled = compileCsharpSource({ sourceText: header + `
      export class NullableAttribute extends Attribute { constructor(value: string | null | undefined) { super(); } }
      annotate<Subject>().add(() => new NullableAttribute(${expression}));
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.extensionDiagnostics, []);
    assert.deepEqual(compiled.targetDiagnostics, []);
    assert.ok(emittedCsharp(compiled).includes("[NullableAttribute(default(string?))]"));
  });
}

for (const [name, application, argument] of [
  ["a .NET static readonly field", "annotate<Subject>().add(() => new ObsoleteAttribute(NativeString.Empty));", 1],
  ["an immediately invoked lambda", 'annotate<Subject>().add(() => new ObsoleteAttribute((() => "x")()));', 1],
  ["a .NET method call", 'annotate<Subject>().add(() => new DebuggerDisplayAttribute(NativeString.Concat("not ", "constant")));', 1],
  ["a module const binding", 'const message = "x"; annotate<Subject>().add(() => new ObsoleteAttribute(message));', 1],
  ["a shadowed undefined binding", 'const undefined = "x"; annotate<Subject>().add(() => new ObsoleteAttribute(undefined));', 1],
  ["a type assertion that changes the resolved type", "annotate<Subject>().add(() => new ObsoleteAttribute(null as unknown as string));", 1],
]) {
  test(`C# rejects ${name} as an attribute argument before publication`, () => {
    const compiled = compileCsharpSource({ sourceText: header + application });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.extensionDiagnostics, []);
    const attributeDiagnostics = compiled.targetDiagnostics.filter(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION");
    assert.equal(attributeDiagnostics.length, 1, JSON.stringify(compiled.targetDiagnostics));
    assert.match(attributeDiagnostics[0].message, new RegExp(`^C# attribute application argument ${argument} `, "u"));
    assert.equal(compiled.result.program === undefined, true, "rejected application publishes no program");
    assert.equal(compiled.result.plan === undefined, true, "rejected application publishes no plan");
    assert.deepEqual(compiled.result.artifacts, []);
  });
}
