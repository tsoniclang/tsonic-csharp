import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { nativeMemoryProvider, nativeProviderProofSource, nativeProviderInferredProofSource } from "../../helpers/native-memory-provider.mjs";
import { nativeRecordProvider, nativeProviderRecordProofSource } from "../../helpers/native-record-proof.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";

function compile(options = {}, sourceText = nativeProviderProofSource, records = false) {
  return compileCsharpSource({ sourceText,
    capabilities: [memoryAbiCapability("csharp"), records ? nativeRecordProvider(options) : nativeMemoryProvider(options)] });
}

function verifyProviderSource(sourceText, records = false) {
  const compiled = compile({}, sourceText, records);
  assertCsharpCompilationSucceeded(compiled);
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const scratch = join(repository, ".temp");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "native-provider-"));
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, records ? /NativeMemoryProof.Provider.CreateEnvelope/u : /NativeMemoryProof.Provider.Acquire/u);
  assert.match(source, records ? /NativeLayout<.*Envelope>/u : /NativeLocation.Reinterpret<uint>/u);
  writeFileSync(join(root, "Provider.cs"), readFileSync(new URL("../../fixtures/native-memory/Provider.cs", import.meta.url)));
  writeFileSync(join(root, "Program.cs"), records
    ? `if (!Tsonic.Generated.Index.run()) throw new System.Exception("native record storage");`
    : `
using System.Runtime.CompilerServices;
if (!Execute()) throw new System.Exception("native provider pointer retention");
if (!Tsonic.Generated.Index.released()) throw new System.Exception("native provider lease leak");
if (!ExecuteTyped()) throw new System.Exception("native provider typed location");
if (!Tsonic.Generated.Index.released()) throw new System.Exception("native provider typed lease leak");
[MethodImpl(MethodImplOptions.NoInlining)]
static bool Execute() => Tsonic.Generated.Index.run();
[MethodImpl(MethodImplOptions.NoInlining)]
static bool ExecuteTyped() => Tsonic.Generated.Index.ordinaryLocation();
`);
  const runtime = join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj");
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><AllowUnsafeBlocks>true</AllowUnsafeBlocks>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup><ProjectReference Include="${runtime}" /></ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
}

test("selected native provider records preserve packed nested fields and value copies", { timeout: 300_000 },
  () => verifyProviderSource(nativeProviderRecordProofSource, true));

for (const options of [{ missingField: true }, { wrongField: true }, { missingContract: true }]) {
  test(`native record rejects ${Object.keys(options)[0]} before publishing artifacts`, () => {
    const compiled = compile(options, nativeProviderRecordProofSource, true);
    assertCsharpCheckingSucceeded(compiled);
    assert.ok(compiled.targetDiagnostics.some(diagnostic =>
      diagnostic.code === "CSHARP_NATIVE_BACKING_NOT_PROVEN" || diagnostic.message.includes("native value representation")),
    JSON.stringify(compiled.targetDiagnostics));
    assert.equal(compiled.artifacts.size, 0);
  });
}

for (const [name, sourceText] of [["helpers and containers", nativeProviderProofSource],
  ["inferred types without marker imports", nativeProviderInferredProofSource]]) {
  test(`selected native provider pointers retain original storage through ${name}`, { timeout: 300_000 },
    () => verifyProviderSource(sourceText));
}

for (const options of [{ missingRelation: true }, { wrongCarrier: true }, { wrongPointee: true }, { wrongGenericPointee: true }, { wrongByRefPointee: true }]) {
  test(`native provider rejects ${Object.keys(options)[0]} before publishing artifacts`, () => {
    const compiled = compile(options);
    assertCsharpCheckingSucceeded(compiled);
    assert.ok(compiled.targetDiagnostics.some(diagnostic => options.missingRelation
      ? diagnostic.code === "CSHARP_UNSUPPORTED_AST" && diagnostic.message.includes("no C# target relation")
      : diagnostic.code === "CSHARP_TARGET_CALL_NOT_CLOSED" && diagnostic.message.includes("canonical source pointer carrier")),
    JSON.stringify(compiled.targetDiagnostics));
    assert.equal(compiled.artifacts.size, 0);
  });
}
