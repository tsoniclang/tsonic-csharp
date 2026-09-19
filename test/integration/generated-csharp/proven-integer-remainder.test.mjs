import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { integerRemainderCases, integerRemainderExecutionSource } from "../../../../tsonic/test/fixtures/proven-integer-remainder.mjs";

test("proven integer remainder preserves all number results and rejects uncertain numeric selections", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: integerRemainderExecutionSource() });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  for (const entry of integerRemainderCases) {
    const start = output.indexOf(`double ${entry.name}(`);
    assert.notEqual(start, -1, entry.name);
    const next = output.indexOf("public static", start + 1);
    const body = output.slice(start, next < 0 ? undefined : next);
    assert.equal((body.match(/\(int\)/gu) ?? []).length, entry.selected * 2, entry.name);
  }
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "integer-remainder-");
  for (const [path, text] of compiled.artifacts) {
    if (!path.endsWith(".cs")) continue;
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), "if (!Tsonic.Generated.Index.run()) throw new System.Exception(\"integer remainder\");");
  const references = [
    join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj"),
    join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj"),
  ];
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable>
<TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup>
${references.map(path => `<ProjectReference Include="${path}" />`).join("")}</ItemGroup></Project>`);
  const result = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
});
