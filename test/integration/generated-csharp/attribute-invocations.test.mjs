import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

function nativeAttributeProject(compiled, name, program) {
  assertCsharpCompilationSucceeded(compiled);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), name);
  for (const [path, contents] of compiled.artifacts) {
    if (!path.endsWith(".cs")) continue;
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  writeFileSync(join(root, "Program.cs"), program);
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable>
<TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>`);
  return spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
}

test("checked attribute lambdas retain native metadata at every supported C# placement", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute } from "@tsonic/core/lang.js";
    import { SerializableAttribute, NonSerializedAttribute } from "@tsonic/dotnet/System.js";
    import { DebuggerDisplayAttribute, DebuggerStepThroughAttribute } from "@tsonic/dotnet/System/Diagnostics.js";
    import { InAttribute } from "@tsonic/dotnet/System/Runtime/InteropServices.js";
    import { MaybeNullAttribute } from "@tsonic/dotnet/System/Diagnostics/CodeAnalysis.js";
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

test("native C# still rejects nonattributes, nonconstants, duplicate and illegal placements", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute } from "@tsonic/core/lang.js";
    import { Exception, SerializableAttribute, ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    import { DebuggerDisplayAttribute } from "@tsonic/dotnet/System/Diagnostics.js";
    export class Subject { read(value: string): string { return value; } }
    function label(): string { return "not constant"; }
    attribute<Subject>().add(() => new Exception("not metadata"));
    attribute<Subject>().add(() => new SerializableAttribute());
    attribute<Subject>().add(() => new SerializableAttribute());
    attribute<Subject>().add(() => new DebuggerDisplayAttribute(label()));
    attribute<Subject>().method(subject => subject.read).parameter("value").add(() => new ObsoleteAttribute("illegal"));
  ` });
  const native = nativeAttributeProject(compiled, "attribute-rejections-", "System.Console.WriteLine(0);");
  assert.notEqual(native.status, 0);
  for (const code of ["CS0616", "CS0579", "CS0182", "CS0592"]) {
    assert.ok((native.stdout + native.stderr).includes(code), `${code}\n${native.stdout}\n${native.stderr}`);
  }
});
