import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

test("lambda binding patterns share parameter lowering and preserve evaluation order", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    type Point = { x: number; nested: { y: number } };
    type Options = { value?: number };
    let reads = 0;
    function readCount(): number { return reads; }
    function makePoint(): Point { reads++; return { x: 2, nested: { y: 3 } }; }
    export function run(): boolean {
      const nested = ({ x: left, nested: { y: right } }: Point): number => left + right;
      const tuple = function ([left, right]: [number, number]): number { return left - right; };
      const defaults = ({ value = 7 }: Options): number => value;
      const wholeDefault = ({ value = 11 }: Options = {}): number => value;
      const arrayRest = ([first, ...rest]: number[]): number => first + rest.length;
      const supplied: Options = {};
      const aliased = nested;
      const objects = { sum({ x, nested: { y } }: Point): number { return x + y; } };
      return aliased(makePoint()) === 5 && readCount() === 1 && tuple([9, 4]) === 5 &&
        defaults(supplied) === 7 && defaults({ value: 0 }) === 0 && wholeDefault() === 11 &&
        wholeDefault({ value: 0 }) === 0 && arrayRest([5, 8, 9]) === 7 &&
        objects.sum(makePoint()) === 5 && readCount() === 2;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "lambda-bindings-");
  for (const [path, source] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  writeFileSync(join(root, "Program.cs"), 'if (!Tsonic.Generated.Index.run()) throw new System.Exception("lambda bindings");');
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
