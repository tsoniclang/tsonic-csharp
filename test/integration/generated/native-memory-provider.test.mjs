import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { nativeMemoryProvider, nativeProviderProofSource, nativeProviderInferredProofSource } from "../../helpers/native-memory-provider.mjs";
import { nativeRecordProvider, nativeProviderRecordProofSource, nativeProviderRecordNoRawProofSource } from "../../helpers/native-record-proof.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

function compile(options = {}, sourceText = nativeProviderProofSource, records = false) {
  return compileCsharpSource({ sourceText,
    capabilities: [memoryAbiCapability("csharp"), records ? nativeRecordProvider(options) : nativeMemoryProvider(options)] });
}

function verifyProviderSource(sourceText, records = false, raw = true) {
  const compiled = compile({}, sourceText, records);
  assertCsharpCompilationSucceeded(compiled);
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const scratch = join(repository, ".temp");
  const root = createTestWorkspace(scratch, "native-provider-");
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, records ? /NativeMemoryProof.Provider.CreateEnvelope/u : /NativeMemoryProof.Provider.Acquire/u);
  if (raw) assert.match(source, records ? /NativeLayout<.*Envelope>/u : /NativeLocation.Reinterpret<uint>/u);
  else assert.doesNotMatch(source, /NativeLayout|RawPointer|NativeMemory\.Allocate/u);
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

test("selected native provider records preserve packed nested fields and value copies", () => {
  const sourceText = nativeProviderRecordProofSource;
  const compiled = compile({}, sourceText, true);
  assertCsharpCheckingSucceeded(compiled);
  const diagnostics = compiled.result.diagnostics.map(issue => {
    const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
    const start = range?.kind === "authored" ? range.start : undefined;
    const end = range?.kind === "authored" ? range.end : undefined;
    return { code: issue.code, message: issue.message, start, end,
      text: start === undefined || end === undefined ? undefined : sourceText.slice(start, end) };
  });
  assert.deepEqual(diagnostics, [
  {
    "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
    "message": "Declared raw storage requires a complete compiler-owned native struct field declaration.",
    "start": 1489,
    "end": 1516,
    "text": "torawptr(pointer, envelope)"
  }
]);
  assert.equal(compiled.artifacts.size, 0);
});

test("selected native provider records retain complete value copies and aliases without raw views", { timeout: 300_000 },
  () => verifyProviderSource(nativeProviderRecordNoRawProofSource, true, false));

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
