import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded } from "./direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../tsonic/test/scripts/test-workspaces.mjs";

export function executeCsharpConstruction(compiled, name, asynchronous = false, allowUnsafe = false, additionalReferences = []) {
  assertCsharpCompilationSucceeded(compiled);
  const scratch = fileURLToPath(new URL("../../.temp/", import.meta.url));
  const root = createTestWorkspace(scratch, `${name}-`);
  for (const [path, text] of compiled.artifacts) {
    if (!path.endsWith(".cs")) continue;
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  if (!compiled.artifacts.has("generated/TsonicEntrypoint.cs")) {
    writeFileSync(join(root, "Program.cs"), `if (!(${asynchronous ? "await " : ""}Tsonic.Generated.Index.run())) throw new System.Exception("source construction contract");`);
  }
  const references = [
    join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj"),
    join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj"),
    ...additionalReferences,
  ];
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<AllowUnsafeBlocks>${allowUnsafe}</AllowUnsafeBlocks>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup>${references.map(path => `<ProjectReference Include="${path}" />`).join("")}</ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
  return native.stdout;
}
