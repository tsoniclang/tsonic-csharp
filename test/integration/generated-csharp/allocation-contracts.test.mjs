import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

test("direct module helpers and array literals execute without delegate or staging-array owners", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function call(value: string): boolean { return isToken(value); }
    const isToken = (value: string): boolean => value === ")";
    const retained = (value: string): string => value;
    function getCallback(): (value: string) => string { return retained; }
    export function run(): boolean {
      const values = ["café", "😀"];
      const alias = values;
      alias.push("tail");
      return call(")") && getCallback()("kept") === "kept" && values.join("|") === "café|😀|tail";
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, /static bool isToken\(string value\)/u);
  assert.doesNotMatch(output, /Func<string, bool>/u);
  assert.match(output, /Func<string, string>/u);
  assert.match(output, /JSArray<string>\.of\("café", "😀"\)/u);
  assert.doesNotMatch(output, /new string\[\]/u);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "allocation-proof-");
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), 'if (!Tsonic.Generated.Index.run()) throw new System.Exception("allocation contract");');
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable>
<TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup>
<ProjectReference Include="${join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj")}" />
</ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
});
