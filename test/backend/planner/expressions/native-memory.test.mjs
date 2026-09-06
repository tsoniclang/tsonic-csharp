import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability, nativeLocationProofSource } from "../../../helpers/memory-abi.mjs";

test("native locations retain original local storage, allocation aliases and lifetime owners", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: nativeLocationProofSource, capabilities: [memoryAbiCapability("csharp")] });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, /NativeLocation.Allocate<uint>/u);
  assert.match(output, /NativeLocation.Reinterpret<uint>/u);
  assert.match(output, /value.Value/u);
  const repository = fileURLToPath(new URL("../../../../", import.meta.url));
  const root = join(repository, ".temp/native-location-aliases");
  mkdirSync(root, { recursive: true });
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), 'if (!Tsonic.Generated.Index.run()) throw new System.Exception("native location aliasing");\n');
  const runtime = resolve(repository, "../csharp-runtime/src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj");
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors><AllowUnsafeBlocks>true</AllowUnsafeBlocks></PropertyGroup>
    <ItemGroup><ProjectReference Include="${runtime}" /></ItemGroup>
  </Project>`);
  for (const args of [["build", "Proof.csproj", "-c", "Release", "-m:2", "-p:UseSharedCompilation=false"], ["bin/Release/net10.0/Proof.dll"]]) {
    const result = spawnSync("dotnet", args, { cwd: root, encoding: "utf8", timeout: 180_000,
      env: { ...process.env, DOTNET_PROCESSOR_COUNT: "2" } });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  }
});

for (const [name, source, diagnostic] of [
  ["managed byref from native local backing", `import { UInt32 } from "@tsonic/dotnet/System.js";
    import { addressOf, writeOnlyRef } from "@tsonic/core/lang.js";
    export function expose(): boolean {
      let value: uint32 = 1;
      const pointer = addressOf(value);
      toRawPointer(pointer, word);
      return UInt32.TryParse("2", writeOnlyRef(value));
    }`, "CSHARP_NATIVE_BACKING_BYREF_NOT_PROVEN"],
  ["open caller", `export function expose(pointer: Pointer<uint32>) { return toRawPointer(pointer, word); }`, "CSHARP_POINTER_BACKING_NOT_PROVEN"],
  ["conflicting inferred pointees", `import type { int32 } from "@tsonic/core/types.js"; export function expose(flag: boolean) { return flag ? allocatePointer<uint32>(1) : allocatePointer<int32>(2); }`, "CSHARP_UNSUPPORTED_AST"],
  ["logical projection", `export function expose() { const pointer = allocatePointer<uint32>(1); return toRawPointer(projectPointer<uint32, uint32>(pointer, value => value, value => value), word); }`, "CSHARP_POINTER_BACKING_NOT_PROVEN"],
  ["incompatible scalar size", `const wrong = memoryLayout<uint32>(abi, 8, 4, 8); export function expose(raw: RawPointer | undefined) { unsafeContext(); return reinterpretRawPointer(raw, wrong); }`, "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED"],
  ["unsafe context", `export function expose(raw: RawPointer | undefined): Pointer<uint32> | undefined { return reinterpretRawPointer(raw, word); }`, "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED"],
  ["invalid bit patterns", `const invalid = memoryLayout<boolean>(abi, 1, 1, 1); export function expose(raw: RawPointer | undefined) { unsafeContext(); return reinterpretRawPointer(raw, invalid); }`, "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED"],
]) {
  test(`native memory rejects ${name} without publishing artifacts`, () => {
    const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `
import { abi } from "test:abi";
import { memoryLayout, toRawPointer, reinterpretRawPointer, allocatePointer, projectPointer, unsafeContext } from "@tsonic/core/lang.js";
import type { Pointer, RawPointer, uint32 } from "@tsonic/core/types.js";
const word = memoryLayout<uint32>(abi, 4, 4, 4);
${source}
` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.extensionDiagnostics, []);
    assert.ok(compiled.targetDiagnostics.some(item => item.code === diagnostic), JSON.stringify(compiled.targetDiagnostics, null, 2));
    assert.equal(compiled.artifacts.size, 0);
  });
}
