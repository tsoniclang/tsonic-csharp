import { resolvedNativeBinding } from "../../../fixtures/dotnet-provider/native-inheritance.helpers.mjs";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createTestWorkspace } from "../../../../../tsonic/test/scripts/test-workspaces.mjs";
import { createDotnetReflectionTypeDataProvider } from "../../../helpers/dotnet-reflection-provider.mjs";
import { buildDotnetFixture } from "../../../helpers/dotnet-fixtures.mjs";
import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";
import { nativeObjectFixtureDeclaration, nativeTypeFixture } from "../../../fixtures/dotnet-provider/native-inheritance.helpers.mjs";
import { validateDotnetModuleModelContract } from "../../../../dist/public/provider-dotnet.js";
import { csharpNativeTargetBindingFact } from "../../../../dist/target-model/types/native-inheritance.js";
import { createDotnetTargetBindingIndex } from "../../../../dist/providers/native/acquisition/target-binding-index.js";
import { validateModuleSatisfiesRequest } from "../../../../dist/providers/native/acquisition/module-request-validation.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const projectDirectory = resolve(repoRoot, "test/fixtures/dotnet-provider/inheritance");
const moduleSpecifier = "@tsonic/dotnet/InheritanceProviderFixtures.js";
const completeRequest = { moduleSpecifier, materialization: { kind: "complete" } };
let captured;

function fixture() {
  if (captured !== undefined) return captured;
  const reference = buildDotnetFixture({
    project: resolve(projectDirectory, "InheritanceProviderFixture.csproj"),
    projectDirectory,
    outputDirectory: resolve(repoRoot, ".temp/native-inheritance-fixture/bin"),
    intermediateDirectory: resolve(repoRoot, ".temp/native-inheritance-fixture/obj"),
    outputAssemblyName: "InheritanceProviderFixture.dll",
  });
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference], disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, moduleSpecifier);
  assert.equal("exports" in module, true, "complete native inheritance fixture acquisition");
  captured = { provider, module, reference };
  return captured;
}

function declaration(name) {
  const found = fixture().module.exports.find(entry => entry.kind === "type" && entry.sourceName === name);
  assert.equal(found !== undefined, true, `native declaration ${name}`);
  return found;
}

function synthetic() {
  return nativeTypeFixture({
    kind: "type", typeKind: "class", sourceName: "Empty", namespaceName: "Inventory",
    targetId: "Inventory.Tests::Inventory.Empty", metadataName: "Inventory.Empty",
    isByRefLike: false, constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [],
  });
}

test("native inheritance carries class identities and constructed arguments through System.Object", () => {
  const closed = declaration("ClosedBase");
  assert.equal(closed.inheritance.length, 3);
  assert.equal(closed.inheritance[0].targetId, closed.targetId);
  assert.equal(closed.inheritance[1].type.metadataName, "InheritanceProviderFixtures.NativeBase`1");
  assert.equal(closed.inheritance[1].type.typeArguments[0].name, "int32");
  assert.equal(closed.inheritance.at(-1).type.kind, "object");
  const external = declaration("CrossNamespaceBase");
  assert.equal(external.inheritance[1].type.metadataName, "System.Collections.Generic.List`1");
  assert.equal(external.inheritance[1].type.typeArguments[0].name, "int32");
  for (const entry of closed.inheritance) assert.equal(Object.hasOwn(entry, "members"), false);
});

test("native own inventories retain exactly the external-derived accessibility and member kinds", () => {
  const base = declaration("NativeBase");
  const members = base.inheritableMembers;
  for (const [name, accessibility] of [["Visible", "public"], ["Protected", "protected"], ["ProtectedOrInternal", "protected-internal"]]) {
    assert.equal(members.some(member => member.targetName === name && member.accessibility === accessibility), true, name);
  }
  for (const name of ["Private", "Internal", "PrivateProtected", "InternalField", "PrivateProtectedField", "InternalProperty", "PrivateProperty", "InternalEvent", "InternalNested", "PrivateNested"])
    assert.equal(members.some(member => member.targetName === name), false, name);
  for (const [name, kind] of [["PublicField", "field"], ["PublicProperty", "property"], ["PublicEvent", "event"], ["PublicNested", "type"]])
    assert.equal(members.some(member => member.targetName === name && member.kind === kind), true, name);
  assert.equal(members.some(member => member.kind === "constructor"), false);
  assert.equal(members.some(member => member.targetName === "GetType"), false, "no copied Object members");
});

test("native inherited signatures preserve generic parameter identity and exact passing modes", () => {
  const members = declaration("NativeBase").inheritableMembers;
  const generic = members.find(member => member.targetName === "Generic");
  assert.equal(generic.genericArity, 1);
  assert.equal(generic.genericParameterIds.length, 1);
  assert.equal(generic.parameters[1].type.identity, generic.genericParameterIds[0]);
  assert.equal(generic.parameters[0].type.kind, "type-parameter");
  assert.deepEqual(members.find(member => member.targetName === "Passing").parameters.map(parameter => parameter.passingMode),
    ["byref-readwrite", "byref-readonly", "byref-writeonly-must-init"]);
  assert.equal(members.find(member => member.targetName === "PublicNested").genericArity, 1);
});

test("all retained native chain declarations can be completed before the name seal without copying member lists", () => {
  const { provider } = fixture();
  const closed = declaration("ClosedBase");
  const views = closed.inheritance.map(entry => csharpNativeTargetBindingFact(resolvedNativeBinding(provider.findTargetBindingByTargetId(entry.targetId, "ordinary"))));
  assert.equal(views.every(view => view !== undefined), true, "every native chain declaration complete");
  assert.equal(views[0].csharpInheritableMembers.some(member => member.targetName === "GetType"), false);
  assert.equal(views.at(-1).csharpInheritableMembers.some(member => member.targetName === "GetType"), true);
  assert.equal(views.at(-1).csharpInheritance.length, 1);
  assert.equal(Object.isFrozen(views[1].csharpInheritableMembers), true);
  console.log(`native-inheritance response-bytes=${Buffer.byteLength(JSON.stringify(fixture().module))} own-member-count=${views.reduce((sum, view) => sum + view.csharpInheritableMembers.length, 0)}`);
});

test("native schema rejects the deleted inventory-free payload and malformed chains at admission", () => {
  const valid = synthetic();
  assert.equal(validateDotnetModuleModelContract({ moduleSpecifier, namespaceName: "Inventory", exports: [valid] }) === undefined, true);
  const { inheritance, ...old } = valid;
  const missing = validateDotnetModuleModelContract({ moduleSpecifier, namespaceName: "Inventory", exports: [old] });
  assert.equal(missing?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(missing.evidence.some(entry => entry.path === "$.exports[0].inheritance"), true);
  const malformed = validateDotnetModuleModelContract({ moduleSpecifier, namespaceName: "Inventory", exports: [{ ...valid, inheritance: inheritance.slice(0, -1) }] });
  assert.equal(malformed?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
});

test("complete acquisition requires a proved own list while actual lazy headers remain valid", () => {
  const { inheritableMembers, ...header } = synthetic();
  const module = { moduleSpecifier, namespaceName: "Inventory", exports: [header] };
  const incrementalRequest = { moduleSpecifier, materialization: { kind: "incremental", completeExports: [] } };
  assert.equal(validateModuleSatisfiesRequest(module, incrementalRequest) === undefined, true);
  const missing = validateModuleSatisfiesRequest(module, completeRequest);
  assert.equal(missing?.code, "DOTNET_REFLECTION_NATIVE_INHERITANCE_INCOMPLETE");
  assert.equal(missing?.message, ".NET reflection provider did not prove complete native class-member inventories.");
  assert.equal(validateModuleSatisfiesRequest({ ...module, exports: [], targetOnlyTypes: [header] }, incrementalRequest)?.code, "DOTNET_REFLECTION_NATIVE_INHERITANCE_INCOMPLETE");
});

test("complete native inventory wins over a later header and contradictions do not partially publish", () => {
  const index = createDotnetTargetBindingIndex();
  const valid = synthetic();
  const module = { moduleSpecifier, namespaceName: "Inventory", exports: [valid] };
  assert.equal(index.rememberModule(module, completeRequest) === undefined, true);
  const { inheritableMembers, ...header } = valid;
  assert.equal(index.rememberModule({ ...module, exports: [header] }, { ...completeRequest, materialization: { kind: "incremental", completeExports: [] } }) === undefined, true);
  assert.equal(Array.isArray(csharpNativeTargetBindingFact(index.getByTargetId(valid.targetId))?.csharpInheritableMembers), true);
  const other = nativeTypeFixture({ ...valid, targetId: "Inventory.Tests::Inventory.Other", metadataName: "Inventory.Other", sourceName: "Other" });
  const contradictory = { ...valid, inheritableMembers: [{ targetName: "Different", kind: "method", static: false, accessibility: "public", genericArity: 0, genericParameterIds: [], parameters: [], dispatchSlots: [{ kind: "method", id: "Inventory.Tests::Inventory.Empty.Different()", baseDefinitionId: "Inventory.Tests::Inventory.Empty.Different()", virtual: false, abstract: false, final: false, accessibility: "public", genericParameterIds: [], parameters: [], returnType: { kind: "void" }, returnPassing: "by-value" }] }] };
  const rejection = index.rememberModule({ ...module, exports: [other, contradictory] }, completeRequest);
  assert.equal(rejection?.code, "DOTNET_REFLECTION_NATIVE_INHERITANCE_CONFLICT");
  assert.equal(index.getByTargetId(other.targetId) === undefined, true, "no partial publication");
  assert.equal(index.getByTargetId(valid.targetId).csharpInheritableMembers.length, 0, "retained original complete inventory");
});

test("System.Object native own inventory is actual reflected metadata rather than a source-name list", () => {
  const root = nativeObjectFixtureDeclaration();
  assert.equal(root.inheritance.length, 1);
  assert.equal(root.inheritance[0].targetId, root.targetId);
  for (const name of ["GetType", "ToString", "Equals", "GetHashCode", "Finalize", "MemberwiseClone"])
    assert.equal(root.inheritableMembers.some(member => member.targetName === name), true, name);
});

test("native dispatch slots retain physical signatures, base slots and virtual abstract final facts", () => {
  const base = declaration("DispatchBase");
  const derived = declaration("DispatchDerived");
  const baseMethod = base.inheritableMembers.find(member => member.targetName === "Transform").dispatchSlots[0];
  const method = derived.inheritableMembers.find(member => member.targetName === "Transform").dispatchSlots[0];
  assert.equal(method.virtual, true);
  assert.equal(method.abstract, false);
  assert.equal(method.final, true);
  assert.equal(baseMethod.virtual, true);
  assert.equal(baseMethod.final, false);
  assert.equal(baseMethod.id, baseMethod.baseDefinitionId);
  assert.equal(method.id === method.baseDefinitionId, false);
  assert.equal(derived.members.find(member => member.targetName === "Transform").signatures[0].id, method.id);
  const abstractSlot = base.inheritableMembers.find(member => member.targetName === "AbstractTransform").dispatchSlots[0];
  assert.equal(abstractSlot.abstract, true);
  assert.equal(derived.inheritableMembers.find(member => member.targetName === "AbstractTransform").dispatchSlots[0].abstract, false);
  const generic = base.inheritableMembers.find(member => member.targetName === "GenericSlot").dispatchSlots[0];
  assert.equal(generic.genericParameterIds.length, 1);
  assert.equal(generic.parameters[1].type.identity, generic.genericParameterIds[0]);
  assert.deepEqual(generic.parameters.map(parameter => parameter.passingMode), ["byref-readwrite", "byref-readonly"]);
  assert.equal(generic.returnType.identity, generic.genericParameterIds[0]);
});

test("native accessor slots retain each visibility and physical value parameter without copying member flags", () => {
  const base = declaration("DispatchBase");
  const property = base.inheritableMembers.find(member => member.targetName === "Item");
  assert.deepEqual(property.dispatchSlots.map(slot => [slot.kind, slot.accessibility]), [["get", "public"], ["set", "protected"]]);
  assert.equal(property.dispatchSlots[0].parameters.length, 0);
  assert.equal(property.dispatchSlots[1].parameters.length, 1);
  assert.equal(property.dispatchSlots[1].parameters[0].type.kind, "type-parameter");
  assert.equal(property.dispatchSlots[1].returnType.kind, "void");
  assert.deepEqual(base.inheritableMembers.find(member => member.targetName === "GetterOnly").dispatchSlots.map(slot => slot.kind), ["get"]);
  assert.deepEqual(base.inheritableMembers.find(member => member.targetName === "Changed").dispatchSlots.map(slot => slot.kind), ["add", "remove"]);
  assert.equal(base.inheritableMembers.find(member => member.targetName === "RefReturn").dispatchSlots[0].returnPassing, "byref-readwrite");
  assert.equal(base.inheritableMembers.find(member => member.targetName === "ReadonlyRefReturn").dispatchSlots[0].returnPassing, "byref-readonly");
  for (const member of declaration("NativeBase").inheritableMembers.filter(member => member.kind === "field" || member.kind === "type"))
    assert.equal(member.dispatchSlots.length, 0, member.targetName);
  const provider = fixture().provider;
  const view = csharpNativeTargetBindingFact(resolvedNativeBinding(provider.findTargetBindingByTargetId(base.targetId, "ordinary")));
  const slots = view.csharpInheritableMembers.find(member => member.targetName === "Item").dispatchSlots;
  assert.equal(Object.isFrozen(slots), true);
  assert.equal(Object.isFrozen(slots[1].parameters), true);
  assert.equal(slots[1].parameters[0].type.kind, "type-parameter");
});

test("the deleted optional dispatch shape and incomplete physical slots are rejected at admission", () => {
  const valid = declaration("DispatchBase");
  const memberIndex = valid.inheritableMembers.findIndex(member => member.targetName === "Transform");
  const member = valid.inheritableMembers[memberIndex];
  const variants = [
    { ...member, dispatchSlots: undefined },
    { ...member, dispatchSlots: [] },
    { ...member, dispatchSlots: [{ ...member.dispatchSlots[0], baseDefinitionId: undefined }] },
    { ...member, dispatchSlots: [{ ...member.dispatchSlots[0], returnPassing: undefined }] },
    { ...member, dispatchSlots: [{ ...member.dispatchSlots[0], virtual: undefined }] },
  ];
  for (const [index, variant] of variants.entries()) {
    const changed = { ...valid, inheritableMembers: valid.inheritableMembers.map((entry, position) => position === memberIndex ? variant : entry) };
    const rejection = validateDotnetModuleModelContract({ moduleSpecifier, namespaceName: "InheritanceProviderFixtures", exports: [changed] });
    assert.equal(rejection?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", `old or invalid slot variant ${index}`);
  }
  const binding = resolvedNativeBinding(fixture().provider.findTargetBindingByTargetId(valid.targetId, "ordinary"));
  const old = { ...binding, csharpInheritableMembers: [{ ...binding.csharpInheritableMembers[0], dispatchSlots: undefined }] };
  assert.equal(csharpNativeTargetBindingFact(old) === undefined, true, "old native-view payload is not a complete success");
});

test("the one metadata-only base-slot producer agrees with actual native GetBaseDefinition across the complete slot family", () => {
  const directory = createTestWorkspace(resolve(repoRoot, ".temp/native-inheritance-oracle"), "run-");
  mkdirSync(directory, { recursive: true });
  const project = resolve(directory, "NativeSlotOracle.csproj");
  const xml = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><AllowUnsafeBlocks>true</AllowUnsafeBlocks><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup><Reference Include="InheritanceProviderFixture"><HintPath>${xml(fixture().reference)}</HintPath></Reference></ItemGroup></Project>`);
  writeFileSync(resolve(directory, "Program.cs"), nativeSlotOracleSource);
  const built = spawnSync("dotnet", ["build", project, "--nologo", "--verbosity", "quiet",
    `--maxcpucount:${process.env.DOTNET_PROCESSOR_COUNT}`, "-p:UseSharedCompilation=false"], { encoding: "utf8" });
  assert.equal(built.status, 0, `handwritten native slot oracle builds: ${built.stdout}\n${built.stderr}`);
  const observed = spawnSync("dotnet", ["run", "--project", project, "--no-build", "--no-restore", "--no-launch-profile"], { encoding: "utf8" });
  assert.equal(observed.status, 0, `handwritten native slot oracle executes: ${observed.stdout}\n${observed.stderr}`);
  const expected = JSON.parse(observed.stdout);
  assert.equal(expected.length >= 30, true, "the oracle covers complete methods, accessors and physical signature families");
  const pointerProvider = createDotnetReflectionTypeDataProvider({
    references: [fixture().reference, resolve(directory, "bin/Debug/net10.0/NativeSlotOracle.dll")], disablePersistentCache: true,
  });
  const pointers = getCompleteDotnetModule(pointerProvider, "@tsonic/dotnet/NativeSlotOracle.js");
  assert.equal("exports" in pointers, true, "real function-pointer override metadata acquisition");
  const declarations = [...fixture().module.exports, ...pointers.exports].filter(entry => entry.kind === "type");
  const actual = new Map(declarations.flatMap(entry => (entry.inheritableMembers ?? []).flatMap(member =>
    member.dispatchSlots.map(slot => [slot.id, slot]))));
  for (const entry of expected) {
    const slot = actual.get(entry.id);
    assert.equal(slot !== undefined, true, `exact physical native method identity ${entry.label}`);
    assert.equal(slot.baseDefinitionId, entry.baseDefinitionId, `actual native base slot ${entry.label}`);
    assert.equal(slot.virtual, entry.virtual, `actual native virtual flag ${entry.label}`);
    assert.equal(slot.abstract, entry.abstract, `actual native abstract flag ${entry.label}`);
    assert.equal(slot.final, entry.final, `actual native final flag ${entry.label}`);
  }
  const sameName = expected.find(entry => entry.label === "SameNameDerived.Match");
  assert.equal(sameName.id, sameName.baseDefinitionId, "same name is not evidence of a native override");
  const nearest = expected.find(entry => entry.label === "LastSlot.Apply");
  assert.equal(nearest.baseDefinitionId.includes(".MiddleSlot.Apply("), true, "stop at the nearest actual native newslot");
  const covariant = expected.find(entry => entry.label === "CovariantDerived.Create");
  assert.equal(covariant.id, covariant.baseDefinitionId, "native covariant newslot retains the actual API meaning, not its MethodImpl declaration");
  const pointer = actual.get(expected.find(entry => entry.label === "FunctionPointerDerived.Invoke").id);
  assert.equal(pointer.parameters[0].type.kind, "function-pointer");
  assert.deepEqual(pointer.parameters[0].type.abi, ["unmanaged", "Cdecl"]);
  console.log(`native-slot-oracle observations=${expected.length} native-stdout=${observed.stdout.trim()}`);
});

const nativeSlotOracleSource = String.raw`
using System.Reflection;
using System.Text.Json;
using InheritanceProviderFixtures;

var types = new[] { typeof(SlotBase<>), typeof(SlotDerived), typeof(MiddleSlot), typeof(LastSlot),
    typeof(CovariantBase), typeof(CovariantDerived), typeof(SameNameBase), typeof(SameNameDerived),
    typeof(DispatchBase<>), typeof(DispatchDerived), typeof(NativeSlotOracle.FunctionPointerBase),
    typeof(NativeSlotOracle.FunctionPointerDerived) };
var rows = types.SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic |
    BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
    .Where(method => method.IsPublic || method.IsFamily || method.IsFamilyOrAssembly)
    .Select(method => new { label = type.Name + "." + method.Name, id = MethodId(method),
        baseDefinitionId = MethodId(method.GetBaseDefinition()), @virtual = method.IsVirtual,
        @abstract = method.IsAbstract, final = method.IsFinal })).ToArray();
Console.WriteLine(JsonSerializer.Serialize(rows));

static string MethodId(MethodInfo method) => TargetId(method.DeclaringType!) + "." + method.Name +
    (method.IsGenericMethodDefinition ? "\u0060\u0060" + method.GetGenericArguments().Length : "") +
    "(" + string.Join(",", method.GetParameters().Select(ParameterId)) + ")";
static string ParameterId(ParameterInfo parameter)
{
    var type = parameter.ParameterType.IsByRef ? parameter.ParameterType.GetElementType()! : parameter.ParameterType;
    var name = TypeId(type);
    if (!parameter.ParameterType.IsByRef) return name;
    if (parameter.IsOut) return "out " + name;
    return parameter.GetCustomAttributesData().Any(attribute => attribute.AttributeType == typeof(System.Runtime.InteropServices.InAttribute))
        ? "in " + name : "ref " + name;
}
static string TypeId(Type type)
{
    if (type.IsArray) return TypeId(type.GetElementType()!) +
        (type.IsSZArray ? "[]" : type.GetArrayRank() == 1 ? "[*]" : "[" + new string(',', type.GetArrayRank() - 1) + "]");
    if (type.IsGenericParameter) return type.Name;
    if (type.IsGenericType && !type.IsGenericTypeDefinition) return TargetId(type.GetGenericTypeDefinition()) +
        "<" + string.Join(",", type.GetGenericArguments().Select(TypeId)) + ">";
    return TargetId(type);
}
static string TargetId(Type type)
{
    var name = type.FullName ?? type.Name;
    var generic = name.IndexOf("[[", StringComparison.Ordinal);
    return type.Assembly.GetName().FullName + "::" + (generic < 0 ? name : name[..generic]);
}

namespace NativeSlotOracle
{
    public unsafe class FunctionPointerBase
    {
        public virtual delegate* unmanaged[Cdecl]<int, int> Invoke(delegate* unmanaged[Cdecl]<int, int> callback) => callback;
    }
    public unsafe class FunctionPointerDerived : FunctionPointerBase
    {
        public override delegate* unmanaged[Cdecl]<int, int> Invoke(delegate* unmanaged[Cdecl]<int, int> callback) => callback;
    }
}
`;
