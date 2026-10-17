import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDotnetFixture } from "../../../helpers/dotnet-fixtures.mjs";
import { createDotnetReflectionTypeDataProvider } from "../../../helpers/dotnet-reflection-provider.mjs";
import { completeDotnetProviderContext, validateDotnetModuleModelContract } from "../../../../dist/public/provider-dotnet.js";
import { dotnetExportToTargetBinding } from "../../../../dist/providers/native/model/index.js";
import { dotnetTypeRefToTargetTypeRef } from "../../../../dist/providers/native/projection/type-ref.js";
import { csharpSourceErrorNames } from "../../../../dist/target-model/identities/source-errors.js";
import { csharpStringTargetType, csharpExceptionTargetType, csharpRuntimeErrorTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const scratch = join(root, `.temp/constraint-reference-owner-${process.pid}`);
let context;

function requireModule(provider, specifier, request) {
  const module = provider.getModule(specifier, completeDotnetProviderContext(request));
  assert.equal("exports" in module, true, `${specifier}: actual native metadata is materialized`);
  assert.equal(validateDotnetModuleModelContract(module), undefined, `${specifier}: actual metadata satisfies its boundary`);
  return module;
}

function requireDeclaration(module, targetId) {
  const declarations = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .filter(value => value.kind === "type" && value.targetId === targetId);
  assert.equal(declarations.length, 1, `${targetId}: one actual native declaration`);
  return declarations[0];
}

function nativeContext() {
  if (context !== undefined) return context;
  const fixture = join(scratch, "fixture");
  mkdirSync(fixture, { recursive: true });
  for (const file of ["ConstraintProviderFixture.csproj", "ConstraintTargets.cs", "CoreTypeNameCollisions.cs"]) {
    copyFileSync(join(root, "test/fixtures/dotnet-provider/constraints", file), join(fixture, file));
  }
  const assembly = buildDotnetFixture({ project: join(fixture, "ConstraintProviderFixture.csproj"),
    projectDirectory: fixture, outputDirectory: join(fixture, "bin"), intermediateDirectory: join(fixture, "obj/"),
    outputAssemblyName: "ConstraintProviderFixture.dll" });
  const oracle = join(scratch, "oracle");
  mkdirSync(oracle, { recursive: true });
  const project = join(oracle, "Oracle.csproj");
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup><ProjectReference Include="${join(root, "../csharp-runtime/src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj")}" />
</ItemGroup></Project>`);
  writeFileSync(join(oracle, "Program.cs"), `using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
var collisionAssembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(args[0]);
var facts = new List<object>();
foreach (var name in new[] { "System.Object", "System.ValueType", "System.Enum" }) {
    var core = typeof(object).Assembly.GetType(name, throwOnError: true)!;
    var collision = collisionAssembly.GetType(name, throwOnError: true)!;
    facts.Add(new { MetadataName = name, CoreTargetId = $"{core.Assembly.FullName}::{core.FullName}",
        CollisionTargetId = $"{collision.Assembly.FullName}::{collision.FullName}",
        Distinct = core != collision, CollisionIsClass = collision.IsClass });
}
var admitted = NativeBounds.FromBase(new NativeBase()) && NativeBounds.FromDelegate((Action)(() => { }));
var classes = new[] { typeof(string), typeof(Exception), typeof(Tsonic.CSharp.Runtime.Error),
    typeof(Tsonic.CSharp.Runtime.RangeError), typeof(Tsonic.CSharp.Runtime.TypeError), typeof(Tsonic.CSharp.Runtime.URIError) }
    .Select(type => new { MetadataName = type.FullName, IsClass = type.IsClass,
        IsCoreExemption = type == typeof(object) || type == typeof(ValueType) || type == typeof(Enum) }).ToArray();
Console.WriteLine(JsonSerializer.Serialize(new { Facts = facts, ReferenceControls = admitted, FactoryClasses = classes }));
public class NativeBase { }
public static class NativeBounds {
    public static bool Reference<T>(T value) where T : class => true;
    public static bool FromBase<T>(T value) where T : NativeBase => Reference(value);
    public static bool FromDelegate<T>(T value) where T : Delegate => Reference(value);
}
`);
  const result = spawnSync("dotnet", ["run", "--project", project, "--verbosity", "quiet",
    `-p:TsonicRuntimeArtifactsPath=${join(scratch, "runtime-artifacts")}/`, "--", assembly],
    { encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  const oracleFacts = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
  assert.equal(oracleFacts.ReferenceControls, true, "real C# class and delegate bounds imply native reference constraints");
  assert.equal(oracleFacts.Facts.length, 3, "all three actual loaded core identities are independently observed");
  context = { assembly, oracleFacts,
    provider: createDotnetReflectionTypeDataProvider({ references: [assembly], disablePersistentCache: true }) };
  return context;
}

test("native core identity, not a rendered name, decides class-bound reference guarantees", { timeout: 240_000 }, () => {
  const { provider, oracleFacts } = nativeContext();
  for (const fact of oracleFacts.Facts) {
    assert.equal(fact.Distinct, true, `${fact.MetadataName}: actual loaded Type identities differ`);
    assert.equal(fact.CollisionIsClass, true, `${fact.MetadataName}: the user definition is actually a native class`);
    for (const [targetId, expected] of [[fact.CoreTargetId, false], [fact.CollisionTargetId, true]]) {
      const module = requireModule(provider, "@tsonic/dotnet/System.js", { requestedTargetIds: [targetId] });
      const declaration = requireDeclaration(module, targetId);
      assert.equal(declaration.constraintRequiresReferenceType, expected,
        `${targetId}: exact selected core identity controls the native fact`);
      const binding = dotnetExportToTargetBinding(declaration);
      assert.equal(binding.csharpType.csharpConstraintRequiresReferenceType === true, expected,
        `${targetId}: the native metadata projection retains exactly the positive proof`);
    }
  }
});

test("String, Exception and every supported runtime Error factory retain actual native class evidence", { timeout: 240_000 }, () => {
  const { oracleFacts } = nativeContext();
  const carriers = [csharpStringTargetType(), csharpExceptionTargetType(),
    ...csharpSourceErrorNames.map(name => csharpRuntimeErrorTargetType(name))];
  assert.equal(oracleFacts.FactoryClasses.length, carriers.length, "all exact native factory classes participate");
  for (const carrier of carriers) {
    const actual = oracleFacts.FactoryClasses.find(value => value.MetadataName === carrier.id);
    assert.equal(actual !== undefined, true, `${carrier.id}: actual selected native type is observed`);
    assert.equal(actual.IsClass, true, `${carrier.id}: native reflection proves the actual class`);
    assert.equal(actual.IsCoreExemption, false, `${carrier.id}: actual core identity does not exempt this class`);
    assert.equal(carrier.csharpConstraintRequiresReferenceType, true,
      `${carrier.id}: the source factory publishes the genuine native bound proof`);
  }
});

test("native declaration and named-reference boundaries refuse missing, malformed and contradictory proof", { timeout: 240_000 }, () => {
  const { provider } = nativeContext();
  const module = requireModule(provider, "@tsonic/dotnet/ProviderConstraintFixtures.js",
    { requestedExports: ["EntityBase", "NativeCategoryGeneric", "NativeCategoryValue"] });
  const declaration = module.exports.find(value => value.sourceName === "EntityBase");
  const generic = module.exports.find(value => value.sourceName === "NativeCategoryGeneric");
  assert.equal(declaration !== undefined && generic !== undefined, true, "actual native reference definitions are present");
  const bound = generic.typeParameters[0].constraints.find(value => value.kind === "implements").contract;
  assert.equal(bound.constraintRequiresReferenceType, true, "the actual named native bound carries its guarantee");
  assert.equal(dotnetTypeRefToTargetTypeRef(bound).csharpConstraintRequiresReferenceType, true,
    "standalone native projection preserves valid selected evidence");
  for (const malformed of [undefined, null, "true", 1]) {
    const invalidDeclaration = { ...declaration, constraintRequiresReferenceType: malformed };
    const invalidReference = { ...bound, constraintRequiresReferenceType: malformed };
    if (malformed === undefined) {
      delete invalidDeclaration.constraintRequiresReferenceType;
      delete invalidReference.constraintRequiresReferenceType;
    }
    const diagnostic = validateDotnetModuleModelContract({ ...module, exports: [invalidDeclaration] });
    assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "invalid actual native proof is refused at its boundary");
    assert.equal(diagnostic.evidence.some(value => value.path.endsWith(".constraintRequiresReferenceType")), true,
      "the exact missing or malformed field owns the native metadata refusal");
    assert.throws(() => dotnetTypeRefToTargetTypeRef(invalidReference), TypeError,
      "a standalone projection cannot silently turn missing native metadata into false");
  }
  const value = module.exports.find(selected => selected.sourceName === "NativeCategoryValue");
  assert.equal(value !== undefined, true, "an actual native value declaration is present");
  const invalidValue = validateDotnetModuleModelContract({ ...module,
    exports: [{ ...value, constraintRequiresReferenceType: true }] });
  assert.equal(invalidValue?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "a value declaration cannot claim reference-only bounds");
});

test("actual native Enum bounds do not imply a reference-type generic constraint", { timeout: 240_000 }, () => {
  nativeContext();
  const directory = join(scratch, "enum-negative");
  mkdirSync(directory, { recursive: true });
  const project = join(directory, "EnumNegative.csproj");
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup></Project>`);
  writeFileSync(join(directory, "Native.cs"), `public static class BoundProof {
    public static bool Reference<T>(T value) where T : class => true;
    public static bool FromEnum<T>(T value) where T : System.Enum => Reference(value);
}
`);
  const result = spawnSync("dotnet", ["build", project, "--nologo", "--verbosity", "quiet"],
    { encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304 });
  assert.equal(result.status === 0, false, "the actual native compiler refuses Enum-to-class constraint implication");
  assert.equal(`${result.stdout}\n${result.stderr}`.includes("CS0452"), true,
    "the native refusal specifically requires an actual reference-type guarantee");
});
