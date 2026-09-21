import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

test("the shared stringify contract requires a guard before a non-null return", () => {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
export function unguarded(): string { return JSON.stringify({ value: 7 }); }
` });
  assert.match(checked.sourceDiagnosticsText, /TS2322/u);
  assert.match(checked.sourceDiagnosticsText, /undefined/u);
});

test("JSON stringify retains absence until source narrowing without native nullable warnings", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
export function record(): string | undefined { return JSON.stringify({ value: 7 }); }
export function absent(value: unknown): string | undefined { return JSON.stringify(value); }
export function nullValue(value: { value: number } | null): string | undefined { return JSON.stringify(value); }
export function narrowed(): string {
  const output = JSON.stringify({ value: 7 });
  if (output === undefined) throw new Error("missing output");
  return output;
}
export function missing(value: unknown): boolean {
  const output = JSON.stringify(value);
  return output === undefined;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /string\? output = Tsonic\.CSharp\.Js\.JSON\.stringify/u);
  assert.match(output, /if \(output is null\)/u);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "json-nullable-");
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text);
  }
  writeFileSync(join(root, "Program.cs"), `using System;
using Subject = Tsonic.Generated.Index;
var undefined = Tsonic.CSharp.Runtime.TsValue.undefined();
if (Subject.record() != "{\\"value\\":7}" || Subject.narrowed() != "{\\"value\\":7}" ||
    Subject.absent(undefined) != null || Subject.nullValue(null) != "null" || !Subject.missing(undefined))
    throw new Exception("JSON absence or narrowing changed");
Console.WriteLine("JSON nullable result: correct");
`);
  const references = [
    join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj"),
    join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj"),
  ];
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable>
<TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup>
${references.map(path => `<ProjectReference Include="${path}" />`).join("")}</ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
  assert.match(native.stdout, /JSON nullable result: correct/u);
});
