import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";

function execute(compiled, name) {
  assertCsharpCompilationSucceeded(compiled);
  const scratch = fileURLToPath(new URL("../../../.temp/", import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, `${name}-`));
  for (const [path, text] of compiled.artifacts) {
    if (!path.endsWith(".cs")) continue;
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), 'if (!Tsonic.Generated.Index.run()) throw new System.Exception("source construction contract");');
  const references = [
    join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj"),
    join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj"),
  ];
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup>${references.map(path => `<ProjectReference Include="${path}" />`).join("")}</ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
}

test("BigInt construction preserves native integer widths and closed numeric unions", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", files: {
    "values.ts": `
      export function exact(value: number | bigint): bigint { return BigInt(value); }
      export function numberValue(value: number | bigint): number { return Number(value); }
    `,
  }, sourceText: `
    import type { int64, uint64, int128 } from "@tsonic/core/types.js";
    import { exact, numberValue } from "./values.js";
    function convert(value: number): bigint { return BigInt(value); }
    export function run(): boolean {
      const signed: int64 = -9007199254740993n;
      const unsigned: uint64 = 9007199254740993n;
      const wide: int128 = 170141183460469231731687303715884105727n;
      let rejected = false;
      try { convert(1.5); } catch { rejected = true; }
      return rejected && BigInt(signed) === -9007199254740993n &&
        BigInt(unsigned) === 9007199254740993n &&
        BigInt(wide) === 170141183460469231731687303715884105727n &&
        convert(-42) === -42n && globalThis.BigInt(9007199254740993n) === 9007199254740993n &&
        BigInt(true) === 1n && BigInt(false) === 0n && BigInt("0xff") === 255n &&
        exact(9007199254740993n) === 9007199254740993n && exact(2) === 2n &&
        numberValue(9007199254740993n) === 9007199254740992 && numberValue(2) === 2;
    }
  ` }), "bigint-construction");
});

test("length constructors preserve holes and generic fill preserves token identity", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    function filled<T>(length: number, value: T): T[] { return new Array<T>(length).fill(value); }
    function retain(token: object): object { return token; }
    export function run(): boolean {
      const first: object = {};
      const alias = retain(first);
      if (Object.isFrozen(alias)) return false;
      const frozen = Object.freeze(first);
      const second: object = Object.freeze({});
      const tokens = new Set<object>();
      tokens.add(first);
      const slots = new Array<object>(3);
      let visits = 0;
      slots.forEach(() => { visits += 1; });
      if (visits !== 0 || slots.length !== 3) return false;
      slots.fill(first);
      const generic = filled(2, second);
      const empty = new Array<number>(0);
      const items = new Array<number>(3, 4);
      const single = Array.of<number>(3);
      const called = Array<number>(2);
      const integer: int64 = 3n;
      const integerItems = new Array<int64>(integer);
      let rejected = false;
      try { new Array<object>(1.5); } catch { rejected = true; }
      return rejected && frozen === alias && Object.isFrozen(alias) && second !== first &&
        tokens.has(alias) && !tokens.has(second) && slots[0] === alias && slots[2] === alias &&
        generic[0] === second && generic[1] === second && empty.length === 0 &&
        items.length === 2 && single.length === 1 && called.length === 2 &&
        integerItems.length === 1 && integerItems[0] === integer;
    }
  ` }), "array-token-construction");
});

test("same-spelled local functions and object members remain ordinary source", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function BigInt(value: number): number { return value + 1; }
    const Object = { freeze(value: number): number { return value + 2; } };
    export function run(): boolean { return BigInt(4) === 5 && Object.freeze(4) === 6; }
  ` });
  execute(compiled, "construction-shadows");
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /BigIntOps|EmptyObject\.Freeze/u);
});

test("nonempty writable shapes cannot silently use the empty frozen carrier", () => {
  for (const sourceText of [
    `export function example(): number { const value = { count: 1 }; Object.freeze(value); value.count = 2; return value.count; }`,
    `function freeze(value: object): object { return Object.freeze(value); } export function example(): object { return freeze({ count: 1 }); }`,
  ]) {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert(compiled.extensionDiagnostics.length + compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.artifacts.size, 0);
  }
});
