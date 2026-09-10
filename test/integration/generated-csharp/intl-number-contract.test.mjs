import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";

test("Intl exact integer, optional precision and grouping contracts execute in C#", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32, uint32, float32, int64, uint64, int128, uint128 } from "@tsonic/core/types.js";
    export function run(signed: int64, unsigned: uint64): boolean {
      const formatter = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
      const options = formatter.resolvedOptions();
      const grouping = options.useGrouping;
      if (typeof grouping !== "string" || grouping !== "auto") return false;
      if (options.minimumFractionDigits !== undefined || options.maximumFractionDigits !== undefined) return false;
      const digits = options.maximumSignificantDigits;
      if (digits === undefined || digits !== 3) return false;
      const plain = new Intl.NumberFormat("en", { useGrouping: false });
      const absentDigits = plain.resolvedOptions().maximumSignificantDigits;
      const absentCurrency = plain.resolvedOptions().currency;
      if (absentDigits !== undefined || absentCurrency !== undefined) return false;
      const currency = new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).resolvedOptions().currency;
      if (currency === undefined || currency !== "USD") return false;
      const disabled = plain.resolvedOptions().useGrouping;
      if (typeof disabled === "string" || disabled !== false) return false;
      const smallSigned: int32 = 7;
      const smallUnsigned: uint32 = 8;
      const single: float32 = 1.25;
      if (plain.format(smallSigned) !== "7" || plain.format(smallUnsigned) !== "8" || plain.format(single) !== "1.25") return false;
      const parts = plain.formatToParts(unsigned);
      const wide: int128 = -170141183460469231731687303715884105728n;
      const wideUnsigned: uint128 = 340282366920938463463374607431768211455n;
      const arbitrary: bigint = 340282366920938463463374607431768211456123n;
      if (plain.format(wide) !== "-170141183460469231731687303715884105728") return false;
      if (plain.format(wideUnsigned) !== "340282366920938463463374607431768211455") return false;
      if (plain.format(arbitrary) !== "340282366920938463463374607431768211456123") return false;
      if (plain.formatToParts(arbitrary)[0].value !== "340282366920938463463374607431768211456123") return false;
      if (arbitrary.toLocaleString("en", { useGrouping: false }) !== "340282366920938463463374607431768211456123") return false;
      if (wide.toLocaleString("en", { useGrouping: false }) !== "-170141183460469231731687303715884105728") return false;
      return formatter.format(1234.5) === "1,230" &&
        plain.format(signed) === "9007199254740993" && plain.format(unsigned) === "18446744073709551615" &&
        parts[0].value === "18446744073709551615" &&
        signed.toLocaleString("en", { useGrouping: false }) === "9007199254740993" &&
        unsigned.toLocaleString() === "18,446,744,073,709,551,615" &&
        unsigned.toLocaleString(undefined) === "18,446,744,073,709,551,615" &&
        signed.toLocaleString(undefined, { useGrouping: false }) === "9007199254740993" &&
        signed.toLocaleString(["en"], { useGrouping: false }) === "9007199254740993" &&
        signed.toLocaleString("en", undefined) === "9,007,199,254,740,993";
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const scratch = fileURLToPath(new URL("../../../.temp/", import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "intl-number-proof-"));
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), 'if (!Tsonic.Generated.Index.run(9007199254740993L, ulong.MaxValue)) throw new System.Exception("Intl number contract");');
  const runtime = join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj");
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup><ProjectReference Include="${runtime}" /></ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
});

test("NumberFormat does not invent an overload for an unsupported source carrier", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { decimal } from "@tsonic/core/types.js";
    export function example(value: decimal): string {
      return new Intl.NumberFormat("en").format(value);
    }
  ` });
  assert.ok(compiled.result.diagnostics.some(diagnostic => diagnostic.category === "error"));
  assert.equal(compiled.artifacts.size, 0);
});
