import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dotnetDependencyArtifactsDirectory, executeDotnetProject } from "./dotnet-execution.mjs";
import { nativeConstructionProject, nativeRuntimeReferences } from "./dotnet-runtime.mjs";
import { assertCsharpCompilationSucceeded } from "./direct-csharp-session.mjs";
import { createTestWorkspace } from "../../../tsonic/test/scripts/test-workspaces.mjs";

export function executeCsharpConstruction(compiled, name, asynchronous = false, allowUnsafe = false, additionalReferences = [], nativeProgram, assemblyName) {
  if (assemblyName !== undefined) {
    assert.ok(typeof assemblyName === "string" && /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(assemblyName),
      "Native construction assemblyName must be a nonempty simple assembly name.");
  }
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
    const invocation = `if (!(${asynchronous ? "await " : ""}Tsonic.Generated.Index.run())) throw new System.Exception("source construction contract");`;
    const entrypoint = asynchronous && compiled.target.surfaces?.includes("js")
      ? `Tsonic.CSharp.Js.JsEventLoop.Run(async () => { ${invocation} });` : invocation;
    writeFileSync(join(root, "Program.cs"), nativeProgram ?? entrypoint);
  }
  const runtime = nativeRuntimeReferences(additionalReferences);
  if (runtime.sharedRestore) {
    writeFileSync(join(root, "NativeReferences.props"), `<Project><ItemGroup>${runtime.references}</ItemGroup></Project>`);
    const native = executeDotnetProject(nativeConstructionProject(), ["-c", "Release", "--no-restore",
      `-p:TsonicProofSourceRoot=${root}${sep}`, `-p:AllowUnsafeBlocks=${allowUnsafe}`,
      `-p:AssemblyName=${assemblyName ?? "Proof"}`, "--verbosity", "quiet"], {
      encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
    });
    assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
    return native.stdout;
  }
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<AllowUnsafeBlocks>${allowUnsafe}</AllowUnsafeBlocks>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
${assemblyName === undefined ? "" : `<AssemblyName>${escapeXml(assemblyName)}</AssemblyName>`}
</PropertyGroup><ItemGroup>${runtime.references}${runtime.graphReferences}${runtime.projects.map(path => `<ProjectReference Include="${escapeXml(path)}" />`).join("")}</ItemGroup></Project>`);
  const native = executeDotnetProject(join(root, "Proof.csproj"), ["-c", "Release",
    `-p:TsonicRuntimeArtifactsPath=${dotnetDependencyArtifactsDirectory()}${sep}`, "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
  return native.stdout;
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
