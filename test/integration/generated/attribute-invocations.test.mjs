import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";

function nativeAttributeProject(compiled, name, program) {
  assertCsharpCompilationSucceeded(compiled);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp", import.meta.url)), name);
  for (const [path, contents] of compiled.artifacts) {
    if (!path.endsWith(".cs")) continue;
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  writeFileSync(join(root, "Program.cs"), program);
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable>
<TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup>
<ProjectReference Include="${join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj")}" />
</ItemGroup></Project>`);
  return spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
}

test("checked attribute lambdas retain native metadata at every supported C# placement", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute } from "@tsonic/core/lang.js";
    import { SerializableAttribute, NonSerializedAttribute } from "@tsonic/dotnet/System.js";
    import { DebuggerDisplayAttribute, DebuggerStepThroughAttribute } from "@tsonic/dotnet/System.Diagnostics.js";
    import { InAttribute } from "@tsonic/dotnet/System.Runtime.InteropServices.js";
    import { MaybeNullAttribute } from "@tsonic/dotnet/System.Diagnostics.CodeAnalysis.js";
    export class Subject {
      value: string;
      constructor(value: string) { this.value = value; }
      get display(): string { return this.value; }
      read(value: string): string { return value; }
    }
    attribute<Subject>().add(() => new SerializableAttribute());
    attribute<Subject>().add(() => new DebuggerDisplayAttribute("{value}"));
    attribute<Subject>().constructor().add(() => new DebuggerStepThroughAttribute());
    attribute<Subject>().constructor().parameter("value").add(() => new InAttribute());
    attribute<Subject>().property(subject => subject.value).target("field").add(() => new NonSerializedAttribute());
    attribute<Subject>().property(subject => subject.display).target("property").add(() => new DebuggerDisplayAttribute("display"));
    attribute<Subject>().method(subject => subject.read).add(() => new DebuggerStepThroughAttribute());
    attribute<Subject>().method(subject => subject.read).parameter("value").target("param").add(() => new InAttribute());
    attribute<Subject>().method(subject => subject.read).target("return").add(() => new MaybeNullAttribute());
  ` });
  const native = nativeAttributeProject(compiled, "attribute-metadata-", `
using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using System.Runtime.InteropServices;
var subject = typeof(Tsonic.Generated.Subject);
static void Require(bool value) { if (!value) throw new Exception("attribute metadata"); }
Require(subject.IsDefined(typeof(SerializableAttribute)));
Require(subject.GetCustomAttribute<DebuggerDisplayAttribute>()!.Value == "{value}");
var constructor = subject.GetConstructors()[0];
Require(constructor.IsDefined(typeof(DebuggerStepThroughAttribute)));
Require(constructor.GetParameters()[0].IsIn);
Require(subject.GetField("value")!.IsDefined(typeof(NonSerializedAttribute)));
Require(subject.GetProperty("display")!.GetCustomAttribute<DebuggerDisplayAttribute>()!.Value == "display");
var method = subject.GetMethod("read")!;
Require(method.IsDefined(typeof(DebuggerStepThroughAttribute)));
Require(method.GetParameters()[0].IsIn);
Require(method.ReturnParameter.IsDefined(typeof(MaybeNullAttribute)));
Require(new Tsonic.Generated.Subject("ok").read("ok") == "ok");
`);
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
});

test("native C# attribute constants preserve wrappers, source enums and exact numeric carriers", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute } from "@tsonic/core/lang.js";
    import type { int32, int64, uint64 } from "@tsonic/core/types.js";
    import { Attribute, Int32, Int64, UInt64 } from "@tsonic/dotnet/System.js";
    import { DescriptionAttribute } from "@tsonic/dotnet/System.ComponentModel.js";
    enum Level { Low = 0, High = 1 }
    export class LevelAttribute extends Attribute { constructor(value: Level) { super(); } }
    export class NumericAttribute extends Attribute { constructor(value: int32) { super(); } }
    export class NumberAttribute extends Attribute { constructor(value: number) { super(); } }
    export class SignedAttribute extends Attribute { constructor(value: int64) { super(); } }
    export class UnsignedAttribute extends Attribute { constructor(value: uint64) { super(); } }
    export class NullableAttribute extends Attribute { constructor(value: string | null | undefined) { super(); } }
    export class SatisfiesSubject {}
    export class NonNullSubject {}
    export class AssertionSubject {}
    export class ConstSubject {}
    export class EnumSubject {}
    export class NumericSubject {}
    export class PromotionSubject {}
    export class SignedSubject {}
    export class UnsignedSubject {}
    export class NullSubject {}
    export class UndefinedSubject {}
    attribute<SatisfiesSubject>().add(() => new DescriptionAttribute("old" satisfies string));
    attribute<NonNullSubject>().add(() => new DescriptionAttribute("old"!));
    attribute<AssertionSubject>().add(() => new DescriptionAttribute(<string>"old"));
    attribute<ConstSubject>().add(() => new DescriptionAttribute("old" as const));
    attribute<EnumSubject>().add(() => new LevelAttribute(Level.High));
    attribute<NumericSubject>().add(() => new NumericAttribute(1.9 as int32));
    attribute<PromotionSubject>().add(() => new NumberAttribute(true ? Int32.MaxValue : 1.9));
    attribute<SignedSubject>().add(() => new SignedAttribute(Int64.MaxValue));
    attribute<UnsignedSubject>().add(() => new UnsignedAttribute(UInt64.MaxValue));
    attribute<NullSubject>().add(() => new NullableAttribute(null));
    attribute<UndefinedSubject>().add(() => new NullableAttribute(undefined));
  ` });
  const native = nativeAttributeProject(compiled, "attribute-constant-metadata-", `
using System;
using System.ComponentModel;
using Tsonic.Generated;
static void Require(bool value) { if (!value) throw new Exception("constant attribute metadata"); }
static object? Argument(Type subject, Type attribute) {
    foreach (var data in subject.GetCustomAttributesData()) {
        if (data.AttributeType == attribute) return data.ConstructorArguments[0].Value;
    }
    throw new Exception("missing constant attribute metadata");
}
foreach (var subject in new[] { typeof(SatisfiesSubject), typeof(NonNullSubject), typeof(AssertionSubject), typeof(ConstSubject) }) {
    Require((string)Argument(subject, typeof(DescriptionAttribute))! == "old");
}
Require((int)Argument(typeof(EnumSubject), typeof(LevelAttribute))! == 1);
Require((int)Argument(typeof(NumericSubject), typeof(NumericAttribute))! == 1);
Require((double)Argument(typeof(PromotionSubject), typeof(NumberAttribute))! == int.MaxValue);
Require((long)Argument(typeof(SignedSubject), typeof(SignedAttribute))! == long.MaxValue);
Require((ulong)Argument(typeof(UnsignedSubject), typeof(UnsignedAttribute))! == ulong.MaxValue);
Require(Argument(typeof(NullSubject), typeof(NullableAttribute)) == null);
Require(Argument(typeof(UndefinedSubject), typeof(NullableAttribute)) == null);
`);
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
});

test("native C# still rejects nonattributes, duplicate and illegal placements", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute } from "@tsonic/core/lang.js";
    import { Exception, SerializableAttribute, ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    export class Subject { read(value: string): string { return value; } }
    attribute<Subject>().add(() => new Exception("not metadata"));
    attribute<Subject>().add(() => new SerializableAttribute());
    attribute<Subject>().add(() => new SerializableAttribute());
    attribute<Subject>().method(subject => subject.read).parameter("value").add(() => new ObsoleteAttribute("illegal"));
  ` });
  const native = nativeAttributeProject(compiled, "attribute-rejections-", "System.Console.WriteLine(0);");
  assert.notEqual(native.status, 0);
  for (const code of ["CS0616", "CS0579", "CS0592"]) {
    assert.ok((native.stdout + native.stderr).includes(code), `${code}\n${native.stdout}\n${native.stderr}`);
  }
});
