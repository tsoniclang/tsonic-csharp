import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDotnetFixture } from "../../../helpers/dotnet-fixtures.mjs";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { createDotnetReflectionTypeDataProvider } from "../../../helpers/dotnet-reflection-provider.mjs";
import { completeDotnetProviderContext, createDotnetModuleSpecifierPolicy, csharpDotnetProviderContributionKind,
  validateDotnetModuleModelContract } from "../../../../dist/public/provider-dotnet.js";
import { dotnetExportToTargetBinding } from "../../../../dist/providers/native/model/index.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const directory = join(root, ".temp/ref-like-native-owner");
const project = join(directory, "RefLikeProof.csproj");
let fixture;

function nativeFixture() {
  if (fixture !== undefined) return fixture;
  mkdirSync(directory, { recursive: true });
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup></Project>`);
  writeFileSync(join(directory, "Native.cs"), `namespace RefLikeProof;
public readonly ref struct Lease {
    public Lease(int value) { Value = value; }
    public int Value { get; }
}
public readonly ref struct Envelope<T> where T : allows ref struct {
    public Envelope(int value) { Value = value; }
    public int Value { get; }
}
public sealed class Box<T> {
    public Box() { }
    public int Value => 11;
}
`);
  const assembly = buildDotnetFixture({ project, projectDirectory: directory,
    outputDirectory: join(directory, "bin"), intermediateDirectory: join(directory, "obj/"),
    outputAssemblyName: "RefLikeProof.dll" });
  const packageName = "@fixture/ref-like";
  const moduleSpecifierPolicy = createDotnetModuleSpecifierPolicy(packageName);
  const capability = { kind: "target-capability", id: packageName, targetId: "csharp", displayName: "Native ref-like owner proof",
    moduleOwnership: [{ specifierPrefix: moduleSpecifierPolicy.modulePrefix }], createTargetContributions: () => [{
      kind: csharpDotnetProviderContributionKind,
      providerIdentity: { id: "fixture.ref-like", version: "1.0.0", target: "csharp", displayName: "Native ref-like owner proof" },
      moduleSpecifierPolicy, referenceDirectoryUrl: pathToFileURL(`${dirname(assembly)}/`).href,
      assemblySourcePackages: [{ assemblyName: "RefLikeProof", packageName }], targetFramework: "net10.0",
    }] };
  fixture = { assembly, capability };
  return fixture;
}

function requireModule(provider, specifier, requestedExports) {
  const result = provider.getModule(specifier, completeDotnetProviderContext({ requestedExports }));
  assert.equal("exports" in result, true, "the real native provider materializes the requested owner");
  assert.equal(validateDotnetModuleModelContract(result), undefined, "the complete native metadata satisfies its current contract");
  return result;
}

function requireType(module, metadataName) {
  const type = module.exports.find(value => value.kind === "type" && value.metadataName === metadataName);
  assert.equal(type !== undefined, true, `one actual native definition for ${metadataName}`);
  return type;
}

test("native reflection preserves BCL and named ref-like traits and actual generic anti-constraints", { timeout: 240_000 }, () => {
  const { assembly } = nativeFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [assembly], disablePersistentCache: true });
  const system = requireModule(provider, "@tsonic/dotnet/System.js", ["Span"]);
  const tasks = requireModule(provider, "@tsonic/dotnet/System.Threading.Tasks.js", ["Task", "ValueTask"]);
  const native = requireModule(provider, "@tsonic/dotnet/RefLikeProof.js", ["Lease", "Envelope", "Box"]);
  for (const [module, name, byRefLike, allowed] of [
    [system, "System.Span`1", true, false],
    [tasks, "System.Threading.Tasks.Task`1", false, false],
    [tasks, "System.Threading.Tasks.ValueTask`1", false, false],
    [native, "RefLikeProof.Envelope`1", true, true],
    [native, "RefLikeProof.Box`1", false, false],
  ]) {
    const declaration = requireType(module, name);
    assert.equal(declaration.isByRefLike, byRefLike, `${name} reads native Type.IsByRefLike`);
    assert.equal(declaration.allowsRefLikeTypeArguments.length, 1, `${name} has one actual native generic slot`);
    assert.equal(declaration.allowsRefLikeTypeArguments[0], allowed, `${name} reads the actual native allows-ref-struct flag`);
    const target = dotnetExportToTargetBinding(declaration).csharpType;
    assert.equal(target.csharpByRefLike === true, byRefLike, `${name} retains its native carrier trait`);
    assert.equal(target.csharpAllowsRefLikeTypeArguments[0], allowed, `${name} retains its native generic permission`);
  }
  const lease = requireType(native, "RefLikeProof.Lease");
  assert.equal(lease.isByRefLike, true, "a user-named native struct is not recognized through a Span spelling");
  const missing = { ...lease };
  delete missing.isByRefLike;
  assert.equal(validateDotnetModuleModelContract({ ...native, exports: [missing] }) !== undefined, true,
    "missing foreign native metadata is not a safe ordinary carrier");
  const omitted = { ...lease };
  delete omitted.allowsRefLikeTypeArguments;
  assert.equal(validateDotnetModuleModelContract({ ...native, exports: [omitted] }) !== undefined, true,
    "native generic permissions cannot be silently defaulted");
});

for (const [name, sourceText, expected] of [
  ["Task result and async parameter", `
import type { int32 } from "@tsonic/core/types.js";
import type { Span } from "@tsonic/dotnet/System.js";
export async function keep(value: Span<int32>, pending: Promise<void>): Promise<Span<int32>> {
  await pending; return value;
}`, ["CSHARP_REFLIKE_ASYNC_PARAMETER", "CSHARP_REFLIKE_ASYNC_RESULT"]],
  ["a local live across suspension", `
import type { int32 } from "@tsonic/core/types.js";
import { Span } from "@tsonic/dotnet/System.js";
export async function keep(pending: Promise<void>): Promise<int32> {
  const values: int32[] = [7]; const view = new Span<int32>(values);
  await pending; return view.Length;
}`, ["CSHARP_REFLIKE_ACROSS_SUSPENSION"]],
]) {
  test(`C# rejects exactly the impossible native ref-like placement: ${name}`, () => {
    const compiled = compileCsharpSource({ sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the source is checked, not syntactically refused");
    const codes = compiled.result.diagnostics.map(value => value.code).sort();
    assert.equal(JSON.stringify(codes), JSON.stringify([...expected].sort()), "the admission owns the exact native refusal");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
      "an impossible native placement is refused before program publication");
  });
}

test("native Span use stays synchronous and pre-await-only locals stay admitted", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
import type { int32 } from "@tsonic/core/types.js";
import { Span } from "@tsonic/dotnet/System.js";
export function keep(value: Span<int32>): int32 { return value.Length; }
export async function run(pending: Promise<void>): Promise<boolean> {
  const values: int32[] = [7, 9]; let size: int32 = 0;
  { const view = new Span<int32>(values); size = keep(view); }
  await pending; return size === 2;
}` });
  executeCsharpConstruction(compiled, "native-ref-like-pre-await", true, false, [],
    "if (!await Tsonic.Generated.Index.run(System.Threading.Tasks.Task.CompletedTask)) throw new System.Exception(\"native ref-like pre-await\");");
});

test("a named native ref-like type and an allows-ref-struct generic stay natively valid", { timeout: 240_000 }, () => {
  const { capability } = nativeFixture();
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import { Lease, Envelope } from "@fixture/ref-like/RefLikeProof.js";
export function keep(value: Lease): boolean { return value.Value === 7; }
export function run(): boolean { return keep(new Lease(7)) && new Envelope<Lease>(9).Value === 9; }
` });
  executeCsharpConstruction(compiled, "named-ref-like-allowed-native-generic", false, false, [project]);
});

test("a native generic without allows-ref-struct refuses the actual named ref-like argument", () => {
  const { capability } = nativeFixture();
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import { Lease, Box } from "@fixture/ref-like/RefLikeProof.js";
export function fail(): boolean { return new Box<Lease>().Value === 11; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the actual native generic placement reaches its admission owner");
  assert.equal(compiled.result.diagnostics.length, 1, "one deciding owner rejects the actual generic construction");
  assert.equal(compiled.result.diagnostics[0].code, "CSHARP_REFLIKE_GENERIC_ARGUMENT", "the native anti-constraint is authoritative");
  assert.equal(compiled.result.program === undefined, true, "no invalid native generic is published");
});
