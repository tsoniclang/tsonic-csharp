import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

const scalars = [
  ["int8", "sbyte", "sbyte.MinValue", "sbyte.MaxValue"],
  ["uint8", "byte", "byte.MinValue", "byte.MaxValue"],
  ["int16", "short", "short.MinValue", "short.MaxValue"],
  ["uint16", "ushort", "ushort.MinValue", "ushort.MaxValue"],
  ["int32", "int", "int.MinValue", "int.MaxValue"],
  ["uint32", "uint", "uint.MinValue", "uint.MaxValue"],
  ["int64", "long", "long.MinValue", "long.MaxValue", "9007199254740993L"],
  ["uint64", "ulong", "ulong.MinValue", "ulong.MaxValue", "9007199254740993UL"],
  ["nativeInt", "nint", "nint.MinValue", "nint.MaxValue"],
  ["nativeUint", "nuint", "nuint.MinValue", "nuint.MaxValue"],
  ["int128", "System.Int128", "System.Int128.MinValue", "System.Int128.MaxValue"],
  ["uint128", "System.UInt128", "System.UInt128.MinValue", "System.UInt128.MaxValue"],
  ["float16", "System.Half", "System.Half.MinValue", "System.Half.MaxValue", "System.Half.NaN", "System.Half.NegativeInfinity"],
  ["float32", "float", "float.MinValue", "float.MaxValue", "float.NaN", "float.PositiveInfinity", "-0.0F"],
  ["float64", "double", "double.MinValue", "double.MaxValue", "double.NaN", "double.PositiveInfinity", "-0.0D"],
  ["decimal", "decimal", "decimal.MinValue", "decimal.MaxValue", "0.1M"],
  ["bigint", "System.Numerics.BigInteger", "System.Numerics.BigInteger.Parse(\"9007199254740993\")", "System.Numerics.BigInteger.Pow(10, 400)", "-System.Numerics.BigInteger.Pow(10, 400)"],
];

test("Number lowers exact native numeric carriers to unboxed conversions and preserves other calls", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { ${scalars.filter(([name]) => name !== "bigint").map(([name]) => name).join(", ")} } from "@tsonic/core/types.js";
${scalars.map(([name]) => `export function convert_${name}(value: ${name}): number { return Number(value); }`).join("\n")}
let events = "";
function left(): int64 { events += "L"; return 9007199254740993n as int64; }
function right(): int64 { events += "R"; return 1n as int64; }
export function order(): boolean {
  events = "";
  const result = Number(left()) + Number(right());
  return events === "LR" && result === 9007199254740992;
}
export function shadowed(): number {
  const Number = (value: number): number => value + 7;
  return Number(2);
}
export function text(value: string): number { return Number(value); }
export function boolean(value: boolean): number { return Number(value); }
export function union(value: string | number): number { return Number(value); }
export function omitted(): number { return Number(); }
export function missing(): number { return Number(undefined); }
export function nil(): number { return Number(null); }
export function literal(): number { return Number(3); }
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  for (const [name] of scalars) {
    const body = output.slice(output.indexOf(`double convert_${name}(`)).split("}")[0];
    assert.match(body, name === "float64" ? /return value;/u : /return \(double\)\(?value\)?;/u, name);
    assert.doesNotMatch(body, /Globals\.Number|object/u, name);
  }
  assert.match(output, /Globals\.Number/u);
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "numeric-number-");
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), `using System;
using Subject = Tsonic.Generated.Index;
static void Equal(double actual, double expected) {
  if (double.IsNaN(expected) ? !double.IsNaN(actual) : BitConverter.DoubleToInt64Bits(actual) != BitConverter.DoubleToInt64Bits(expected))
    throw new Exception("numeric conversion differs from native cast");
}
${scalars.flatMap(([name, type, ...values]) => values.map(value => `Equal(Subject.convert_${name}((${type})(${value})), (double)((${type})(${value})));`)).join("\n")}
if (!Subject.order()) throw new Exception("evaluation order/count");
Equal(Subject.shadowed(), 9);
Equal(Subject.text(" 12.5 "), 12.5);
Equal(Subject.text("bad"), double.NaN);
Equal(Subject.boolean(true), 1);
Equal(Subject.boolean(false), 0);
Equal(Subject.union("15"), 15);
Equal(Subject.union(2.5), 2.5);
Equal(Subject.omitted(), 0);
Equal(Subject.missing(), 0);
Equal(Subject.nil(), 0);
Equal(Subject.literal(), 3);
double sum = 0;
for (long value = 0; value < 10000; value++) sum += Subject.convert_int64(value);
long before = GC.GetAllocatedBytesForCurrentThread();
for (long value = 0; value < 10000; value++) sum += Subject.convert_int64(value);
long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
if (sum != 99990000 || allocated != 0) throw new Exception($"numeric allocation: {allocated}");
Console.WriteLine("numeric conversions: correct; zero allocated bytes");
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
