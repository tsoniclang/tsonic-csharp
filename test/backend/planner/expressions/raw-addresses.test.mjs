import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability, rawAddressProofSource } from "../../../helpers/memory-abi.mjs";

test("raw address integers preserve every bit through nested native byte offsets", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: rawAddressProofSource, capabilities: [memoryAbiCapability("csharp")] });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, /9007199254740993/u);
  assert.match(output, /RawPointer\.OffsetUnsigned/u);
  assert.doesNotMatch(output, /\(double\)|\bunsafe\b/u);
  assert.doesNotMatch(output, /headerAlias|headerLayout|localLayout|tagField/u);
  const repository = fileURLToPath(new URL("../../../../", import.meta.url));
  const root = join(repository, ".temp/raw-address-round-trip");
  mkdirSync(root, { recursive: true });
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), "if (!Tsonic.Generated.Index.run()) throw new System.Exception(\"raw address round trip\");\n");
  const runtime = resolve(repository, "../csharp-runtime/src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj");
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup>
    <ItemGroup><ProjectReference Include="${runtime}" /></ItemGroup>
  </Project>`);
  for (const args of [["build", "Proof.csproj", "-c", "Release", "-m:2", "-p:UseSharedCompilation=false"], ["bin/Release/net10.0/Proof.dll"]]) {
    const result = spawnSync("dotnet", args, { cwd: root, encoding: "utf8", timeout: 180_000,
      env: { ...process.env, DOTNET_PROCESSOR_COUNT: "2" } });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  }
});

test("32-bit address ABI retains its exact native unsigned result", () => {
  const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp", 32)], sourceText: `
import { abi } from "test:abi";
import { addressIntegerToRawPointer, rawPointerToAddressInteger } from "@tsonic/core/lang.js";
import type { uint32 } from "@tsonic/core/types.js";
export function roundTrip(bits: uint32): uint32 {
  return rawPointerToAddressInteger<uint32>(addressIntegerToRawPointer(bits, abi), abi);
}
` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, /uint roundTrip\(uint bits\)/u);
  assert.match(output, /, 32\)/u);
  assert.doesNotMatch(output, /\(double\)/u);
});

test("layout descriptors cannot escape into ordinary runtime returns", () => {
  const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `
import { abi } from "test:abi";
import { memoryLayout } from "@tsonic/core/lang.js";
import type { uint32 } from "@tsonic/core/types.js";
export function escape() { const layout = memoryLayout<uint32>(abi, 4, 4, 4); return layout; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.ok(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "CSHARP_MEMORY_METADATA_RUNTIME_ESCAPE"));
  assert.equal(compiled.artifacts.size, 0);
});
