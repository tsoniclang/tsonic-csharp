import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { nativeNumericTextFunctions } from "../../../../tsonic/test/fixtures/native-numeric-text.mjs";

test("bounded integer results use native words without a BigInteger result allocation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
${nativeNumericTextFunctions}
import type { int128, uint128 } from "@tsonic/core/types.js";
export function signed(value: int64): int64 { return BigInt.asIntN(64, value); }
export function unsigned(value: int64): uint64 { return BigInt.asUintN(64, value); }
export function wide(value: bigint): int128 { return BigInt.asIntN(128, value); }
export function wideUnsigned(value: bigint): uint128 { return BigInt.asUintN(128, value); }
let visits = 0;
function operand(): int64 { visits += 1; return 9007199254740993n; }
export function once(): boolean { return signed(operand()) === 9007199254740993n && visits === 1; }
export function word(): nativeUint { return 100000; }
export function classify(value: int64): boolean {
  return Number.isSafeInteger(value) && Number.isInteger(value) && Number.isFinite(value) && !Number.isNaN(value);
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /BigIntOps\.AsIntNative/u);
  assert.match(output, /BigIntOps\.AsUintNative/u);
  assert.doesNotMatch(output, /BigIntOps\.as(?:Int|Uint)N/u);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "native-integer-results-");
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), `using System;
using System.Numerics;
using Subject = Tsonic.Generated.Index;
if (Subject.signed(9007199254740993L) != 9007199254740993L || Subject.unsigned(-1L) != ulong.MaxValue)
    throw new Exception("64-bit result was rounded or truncated");
if (Subject.wide(BigInteger.CreateChecked(Int128.MaxValue)) != Int128.MaxValue ||
    Subject.wideUnsigned(-BigInteger.One) != UInt128.MaxValue) throw new Exception("128-bit result");
if (!Subject.once() || Subject.word() != 100000 || !Subject.classify(long.MaxValue)) throw new Exception("native proof");
if (Subject.exactWord() != (nuint)9007199254740993UL || !Subject.nativePredicates(long.MaxValue))
    throw new Exception("exact word or global predicate");
if (Subject.signedText(9007199254740993L) != "9007199254740993" || Subject.unsignedHex(ulong.MaxValue) != "ffffffffffffffff")
    throw new Exception("native integer text");
if (Subject.preciseSingle(0.1f) != 0.1f.ToString(System.Globalization.CultureInfo.InvariantCulture) ||
    Subject.fixedSingle(12.5f) != 12.5f.ToString("F2", System.Globalization.CultureInfo.InvariantCulture))
    throw new Exception("native float32 text");
var unbounded = BigInteger.One << 200;
if (Subject.wideIntegerText(unbounded) != unbounded.ToString() || Subject.wideIntegerHex(unbounded) != "1" + new string('0', 50))
    throw new Exception("arbitrary integer text");
var input = new Tsonic.CSharp.Js.Int16Array(new double[] { 1, 2, 127 });
var copy = Subject.copyTyped(input);
var assigned = new Tsonic.CSharp.Js.Uint8Array(3);
Subject.assignTyped(assigned, input);
input[0] = 7;
if (copy[0] != 1 || assigned[2] != 127) throw new Exception("native typed copy");
for (int index = 0; index < 10000; index++) _ = Subject.signed(index);
long before = GC.GetAllocatedBytesForCurrentThread();
long sum = 0;
for (int index = 0; index < 10000; index++) sum += Subject.signed(index);
if (sum != 49995000 || GC.GetAllocatedBytesForCurrentThread() != before) throw new Exception("native integer allocation");
Console.WriteLine("native integer results: correct; zero allocated bytes");
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
});

for (const expression of ["BigInt.asIntN(bits, value)", "BigInt.asIntN(65, value)", "BigInt.asUintN(64, value)"]) {
  test(`native signed conversion rejects an unproved result: ${expression}`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function narrow(bits: number, value: bigint): int64 { return ${expression}; }
` });
    assert(compiled.result.diagnostics.length > 0);
    assert.equal(compiled.artifacts.size, 0);
  });
}

test("a same-spelled local call cannot obtain the built-in integer proof", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function narrow(value: bigint): int64 {
  const BigInt = { asIntN(bits: number, operand: bigint): bigint { return operand; } };
  return BigInt.asIntN(64, value);
}
` });
  assert(compiled.result.diagnostics.length > 0);
  assert.equal(compiled.artifacts.size, 0);
});
