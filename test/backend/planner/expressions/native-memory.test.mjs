import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability, nativeLocationProofSource } from "../../../helpers/memory-abi.mjs";
import { nativeRecordProofSource, nativeFieldProofSource, nativeArrayProofSource } from "../../../helpers/native-record-proof.mjs";

for (const [name, sourceText] of [
  ["self", `export function make(): Pointer<typeof make> { return allocateptr<typeof make>(make); }`],
  ["mutual", `function first(): Pointer<typeof second> { return allocateptr<typeof second>(second); }
    export function second(): Pointer<typeof first> { return allocateptr<typeof first>(first); }`],
]) {
  test(`recursive pointer return carrier rejects ${name} without unbounded classification`, { timeout: 30_000 }, () => {
    const source = `import { allocateptr } from "@tsonic/core/lang.js";
      import type { Pointer } from "@tsonic/core/types.js";
      ${sourceText}`;
    const helper = new URL("../../../helpers/direct-csharp-session.mjs", import.meta.url).href;
    const script = `import assert from "node:assert/strict";
      import { assertCsharpCheckingSucceeded, compileCsharpSource } from ${JSON.stringify(helper)};
      const compiled = compileCsharpSource({ sourceText: ${JSON.stringify(source)} });
      assertCsharpCheckingSucceeded(compiled);
      assert.ok(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST"));
      assert.equal(compiled.artifacts.size, 0);`;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf8", timeout: 20_000, maxBuffer: 1_048_576,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=512" },
    });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  });
}

const crossFileSource = (typeArguments) => `
  import { abi } from "test:abi";
  import { remote } from "./layout.js";
  import type { uint32 } from "@tsonic/core/types.js";
  import { memorylayout, addressof, torawptr, reinterpretrawptr, loadptr,
    storeptr, equalptr, equalrawptr, unsafecontext } from "@tsonic/core/lang.js";
  const local = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
  export function run(): boolean {
    unsafecontext();
    let value: uint32 = 7;
    const pointer = addressof(value);
    const first = torawptr(pointer, local);
    const second = torawptr(pointer, remote);
    const left = reinterpretrawptr(first, local);
    const right = reinterpretrawptr${typeArguments}(second, remote);
    if (left === undefined || right === undefined) return false;
    storeptr(left, 9);
    if (value !== 9 || loadptr(right) !== 9) return false;
    value = 17;
    return loadptr(right) === 17 && equalptr(pointer, left) && equalrawptr(first, second);
  }
`;
const crossFileLayout = `
  import { abi } from "test:abi";
  import type { uint32 } from "@tsonic/core/types.js";
  import { memorylayout } from "@tsonic/core/lang.js";
  export const remote = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
`;

const ordinaryFieldSource = `function ordinary(cell: { value: string }): string { return cell.value; }
  function ordinaryProof(): boolean { return ordinary({ value: "native" }) === "native"; }`;
const nativeFieldReturn = "return loadptr(pointer) === 21;";
assert.equal(nativeFieldProofSource.split(nativeFieldReturn).length - 1, 1);
const mixedFieldSource = nativeFieldProofSource.replace(nativeFieldReturn,
  "return loadptr(pointer) === 21 && ordinaryProof();");

for (const [name, sourceText, files] of [["scalar", nativeLocationProofSource], ["nested packed record", nativeRecordProofSource],
  ["object field", nativeFieldProofSource], ["array element", nativeArrayProofSource],
  ["object field ordinary first", ordinaryFieldSource + mixedFieldSource],
  ["object field ordinary last", mixedFieldSource + ordinaryFieldSource],
  ["cross-file inferred scalar", crossFileSource(""), { "layout.ts": crossFileLayout }],
  ["cross-file explicit scalar", crossFileSource("<uint32>"), { "layout.ts": crossFileLayout }]]) {
test(`native ${name} locations retain storage and replacement semantics`, { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText, files, capabilities: [memoryAbiCapability("csharp")] });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, name.endsWith("scalar") ? /NativeLocation.Allocate<uint>/u
    : name.startsWith("object field") ? /valueLocation/u : name === "array element" ? /NativeArray<uint>/u : /ReadAt<uint>/u);
  if (name.startsWith("object field ordinary")) {
    const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
    assert.match(shapes, /Location<uint> valueLocation/u);
    assert.match(shapes, /NativeLocation\.Allocate<uint>/u);
    assert.doesNotMatch(shapes, /Location<string>/u);
    assert.match(shapes, /interface ObjectShape_[a-f0-9]{12}<Property0>/u);
  }
  assert.match(output, /NativeLocation.Reinterpret<uint>/u);
  if (name.endsWith("scalar")) assert.match(output, /value.Value/u);
  const repository = fileURLToPath(new URL("../../../../", import.meta.url));
  const root = join(repository, `.temp/native-location-aliases-${name.replaceAll(" ", "-")}`);
  mkdirSync(root, { recursive: true });
  for (const [path, text] of compiled.artifacts) if (path.endsWith(".cs")) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(root, "Program.cs"), 'if (!Tsonic.Generated.Index.run()) throw new System.Exception("native location aliasing");\n');
  const runtime = resolve(repository, "../csharp-runtime/src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj");
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors><AllowUnsafeBlocks>true</AllowUnsafeBlocks></PropertyGroup>
    <ItemGroup><ProjectReference Include="${runtime}" /></ItemGroup>
  </Project>`);
  for (const args of [["build", "Proof.csproj", "-c", "Release", "-m:2", "-p:UseSharedCompilation=false"], ["bin/Release/net10.0/Proof.dll"]]) {
    const result = spawnSync("dotnet", args, { cwd: root, encoding: "utf8", timeout: 180_000,
      env: { ...process.env, DOTNET_PROCESSOR_COUNT: "2" } });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  }
});
}

for (const [name, source, diagnostic] of [
  ["managed byref from native array element", `import { UInt32 } from "@tsonic/dotnet/System.js";
    import { addressof, writeonlyref } from "@tsonic/core/lang.js";
    export function expose(): boolean {
      const values: uint32[] = [1];
      torawptr(addressof(values[0]), word);
      return UInt32.TryParse("2", writeonlyref(values[0]));
    }`, "CSHARP_NATIVE_BACKING_BYREF_NOT_PROVEN"],
  ["conflicting array layouts", `import { addressof } from "@tsonic/core/lang.js";
    const packed = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 1, stride: 4, fields: [] });
    export function expose(): void {
      const values: uint32[] = [1, 2];
      const alias = values;
      torawptr(addressof(values[0]), word);
      torawptr(addressof(alias[0]), packed);
    }`, "CSHARP_NATIVE_BACKING_NOT_PROVEN"],
  ["escaping array storage", `import { addressof } from "@tsonic/core/lang.js";
    declare function escape(values: uint32[]): void;
    export function expose(): void {
      const values: uint32[] = [1];
      torawptr(addressof(values[0]), word);
      escape(values);
    }`, "CSHARP_NATIVE_BACKING_NOT_PROVEN"],
  ["captured array storage", `import { addressof } from "@tsonic/core/lang.js";
    export function expose(): void {
      const values: uint32[] = [1];
      torawptr(addressof(values[0]), word);
      const read = () => values[0];
      read();
    }`, "CSHARP_NATIVE_BACKING_NOT_PROVEN"],
  ["managed byref from native object field", `import { UInt32 } from "@tsonic/dotnet/System.js";
    import { addressof, writeonlyref } from "@tsonic/core/lang.js";
    export function expose(): boolean {
      const cell: { value: uint32 } = { value: 1 };
      torawptr(addressof(cell.value), word);
      return UInt32.TryParse("2", writeonlyref(cell.value));
    }`, "CSHARP_NATIVE_BACKING_BYREF_NOT_PROVEN"],
  ["conflicting object field layouts", `import { addressof } from "@tsonic/core/lang.js";
    const packed = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 1, stride: 4, fields: [] });
    export function expose(): void {
      const cell: { value: uint32 } = { value: 1 };
      const alias = cell;
      torawptr(addressof(cell.value), word);
      torawptr(addressof(alias.value), packed);
    }`, "CSHARP_NATIVE_BACKING_NOT_PROVEN"],
  ["managed byref from native local backing", `import { UInt32 } from "@tsonic/dotnet/System.js";
    import { addressof, writeonlyref } from "@tsonic/core/lang.js";
    export function expose(): boolean {
      let value: uint32 = 1;
      const pointer = addressof(value);
      torawptr(pointer, word);
      return UInt32.TryParse("2", writeonlyref(value));
    }`, "CSHARP_NATIVE_BACKING_BYREF_NOT_PROVEN"],
  ["open caller", `export function expose(pointer: Pointer<uint32>) { return torawptr(pointer, word); }`, "CSHARP_POINTER_BACKING_NOT_PROVEN"],
  ["conflicting inferred pointees", `import type { int32 } from "@tsonic/core/types.js"; export function expose(flag: boolean) { return flag ? allocateptr<uint32>(1) : allocateptr<int32>(2); }`, "CSHARP_UNSUPPORTED_AST"],
  ["logical projection", `export function expose() { const pointer = allocateptr<uint32>(1); return torawptr(projectptr<uint32, uint32>(pointer, value => value, value => value), word); }`, "CSHARP_POINTER_BACKING_NOT_PROVEN"],
  ["incompatible scalar size", `const wrong = memorylayout<uint32>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, fields: [] }); export function expose(raw: RawPointer | undefined) { unsafecontext(); return reinterpretrawptr(raw, wrong); }`, "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED"],
  ["unsafe context", `export function expose(raw: RawPointer | undefined): Pointer<uint32> | undefined { return reinterpretrawptr(raw, word); }`, "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED"],
  ["invalid bit patterns", `const invalid = memorylayout<boolean>({ datalayout: abi, bytesize: 1, bytealignment: 1, stride: 1, fields: [] }); export function expose(raw: RawPointer | undefined) { unsafecontext(); return reinterpretrawptr(raw, invalid); }`, "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED"],
  ["ordinary reference record", `import { memoryfield } from "@tsonic/core/lang.js";
    interface Record { count: uint32 }
    const record = memorylayout<Record>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4,
      fields: [memoryfield({ select: (value: Record) => value.count, byteoffset: 0, bytealignment: 4, fieldlayout: word })] });
    export function expose(raw: RawPointer | undefined) { unsafecontext(); return reinterpretrawptr(raw, record); }`, "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED"],
  ["incomplete value record", `import { memoryfield, struct, field } from "@tsonic/core/lang.js";
    const Record = struct({ first: field<uint32>(), second: field<uint32>() });
    const record = memorylayout<typeof Record>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8,
      fields: [memoryfield({ select: (value: typeof Record) => value.first, byteoffset: 0, bytealignment: 4, fieldlayout: word })] });
    export function expose(raw: RawPointer | undefined) { unsafecontext(); return reinterpretrawptr(raw, record); }`, "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED"],
]) {
  test(`native memory rejects ${name} without publishing artifacts`, () => {
    const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `
import { abi } from "test:abi";
import { memorylayout, torawptr, reinterpretrawptr, allocateptr, projectptr, unsafecontext } from "@tsonic/core/lang.js";
import type { Pointer, RawPointer, uint32 } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
${source}
` });
    assertCsharpCheckingSucceeded(compiled);
    assert.ok(compiled.targetDiagnostics.some(item => item.code === diagnostic), JSON.stringify(compiled.targetDiagnostics, null, 2));
    assert.equal(compiled.artifacts.size, 0);
  });
}
