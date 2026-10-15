import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

test("native array String conversion preserves typed writing and allocation costs under NativeAOT", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function numeric(): string { return String([1, 2, 3]); }
    export function nested(): string { return String([[1, 2], [3, 4]]); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /JSArray<double>/u);
  assert.doesNotMatch(source, /JSArray<object>|Cast<object>|Select\(/u);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "array-string-native-");
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), `
if (Tsonic.Generated.Index.numeric() != "1,2,3" || Tsonic.Generated.Index.nested() != "1,2,3,4")
    throw new System.Exception("generated array String contract");
Tsonic.CSharp.Js.Tests.TypedArrayStringChecks.CheckValues();
Tsonic.CSharp.Js.Tests.TypedArrayStringChecks.CheckCosts();
`);
  const project = join(root, "Proof.csproj");
  const native = join(root, "native");
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable>
<TreatWarningsAsErrors>true</TreatWarningsAsErrors><PublishAot>true</PublishAot>
</PropertyGroup><ItemGroup>
<ProjectReference Include="${join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj")}" />
<Compile Include="${join(testRepositoryRoots.csharpJs, "tests/Tsonic.CSharp.Js.Tests/Globals/TypedArrayStringChecks.cs")}" Link="TypedArrayStringChecks.cs" />
</ItemGroup></Project>`);
  for (const [command, args] of [
    ["dotnet", ["publish", project, "-c", "Release", "-r", "linux-x64", "--output", native, "--nologo", "--verbosity", "quiet", "-m:1"]],
    [join(native, "Proof"), []],
  ]) {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304 });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  }
});
