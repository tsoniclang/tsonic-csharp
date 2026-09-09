import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";

test("numeric fixed arrays execute with exact cross-file element carriers and ordinary array behavior", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ files: {
    "values.ts": `
      import type { FixedArray, int32 } from "@tsonic/core/types.js";
      export type Values = FixedArray<int32, 3>;
      export function identity(values: Values): Values { return values; }
      export function sum(values: Values): int32 {
        let result: int32 = 0;
        for (const value of values) result += value;
        return result;
      }
    `,
  }, sourceText: `
    import { identity, sum } from "./values.js";
    import type { Values } from "./values.js";
    import type { FixedArray, int32, uint8 } from "@tsonic/core/types.js";
    export function forward(values: Values): Values { return identity(values); }
    export function run(values: Values, empty: FixedArray<uint8, 0>,
      one: FixedArray<uint8, 1>, matrix: FixedArray<Values, 2>): boolean {
      const inferred = forward(values);
      const index: int32 = 1;
      values[index] += 2;
      return empty.length === 0 && one.length === 1 && one[0] === 7 &&
        values.length === 3 && values[1] === 5 && sum(values) === 11 &&
        inferred.length === 3 && identity(values).length === 3 && inferred[2] === 4 &&
        matrix.length === 2 && matrix[0].length === 3 && matrix[1][2] === 6;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const scratch = fileURLToPath(new URL("../../../.temp/", import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "fixed-array-proof-"));
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), 'if (!Tsonic.Generated.Index.run(new int[] { 2, 3, 4 }, new byte[0], new byte[] { 7 }, new int[][] { new int[] { 1, 2, 3 }, new int[] { 4, 5, 6 } })) throw new System.Exception("fixed-array contract");');
  const runtime = join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj");
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup><ProjectReference Include="${runtime}" /></ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
});
