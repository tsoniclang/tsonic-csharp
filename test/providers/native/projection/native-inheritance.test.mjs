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
import { csharpNativeInheritanceLookup, csharpNativeTargetBindingFact } from "../../../../dist/target-model/types/native-inheritance.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/native/projection/relation-resolution.js";
import { createDotnetTargetBindingIndex } from "../../../../dist/providers/native/acquisition/target-binding-index.js";
import { validateModuleSatisfiesRequest } from "../../../../dist/providers/native/acquisition/module-request-validation.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const projectDirectory = resolve(repoRoot, "test/fixtures/dotnet-provider/inheritance");
const moduleSpecifier = "@tsonic/dotnet/InheritanceProviderFixtures.js";
const completeRequest = { moduleSpecifier, materialization: { kind: "complete" } };
let captured;
let capturedNativeSlotObservation;

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

test("native root lookup matches actual published nested and generic metadata names without changing physical identity", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const cases = [
    { module: "System", sourceName: "SpecialFolder", metadataName: "System.Environment.SpecialFolder",
      render: { kind: "named", namespace: ["System"], name: "Environment", nested: [{ name: "SpecialFolder" }] } },
    { module: "System.Collections.Generic", sourceName: "List", metadataName: "System.Collections.Generic.List`1",
      render: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "List", genericArity: 1 } },
    { module: "System.Collections.Generic", sourceName: "Dictionary", metadataName: "System.Collections.Generic.Dictionary`2",
      render: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary", genericArity: 2 } },
  ];
  const routes = [];
  for (const control of cases) {
    const module = getCompleteDotnetModule(provider, `@tsonic/dotnet/${control.module}.js`, { requestedExports: [control.sourceName] });
    assert.equal("exports" in module, true, `${control.metadataName}: native module acquisition`);
    const published = module.exports.find(entry => entry.kind === "type" && entry.metadataName === control.metadataName);
    assert.equal(published !== undefined, true, `${control.metadataName}: actual native declaration`);
    const symbolic = { kind: "target-named", id: control.metadataName, csharpRender: control.render,
      csharpAllowsRefLikeTypeArguments: [] };
    const route = csharpNativeInheritanceLookup(symbolic);
    assert.equal(route.kind, "metadata-name", `${control.metadataName}: exact explicit name selects the metadata route`);
    assert.equal(route.metadataName, published.metadataName, `${control.metadataName}: published query spelling`);
    const selected = resolvedNativeBinding(provider.findTargetBindingByMetadataName(route.metadataName, "ordinary"));
    assert.equal(selected?.id, published.targetId, `${control.metadataName}: existing native query selects the declaration`);
    const physical = csharpNativeInheritanceLookup({ ...symbolic, id: published.targetId });
    assert.equal(physical.kind, "target-id", `${control.metadataName}: physical identity remains assembly-qualified`);
    assert.equal(physical.targetId, published.targetId, `${control.metadataName}: exact native identity is preserved`);
    routes.push({ metadataName: published.metadataName, symbolic: route, physical });
  }
  assert.equal(routes[0].physical.targetId.endsWith("::System.Environment+SpecialFolder"), true,
    "the nested physical identity retains plus while metadata-name queries retain dot");
  const inferredArity = csharpNativeInheritanceLookup({ kind: "target-named", id: "System.Collections.Generic.List`1",
    csharpAllowsRefLikeTypeArguments: [], typeArguments: [{ kind: "source-primitive", name: "number" }],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "List" } });
  assert.equal(inferredArity.kind, "metadata-name", "explicit constructed arguments retain the existing non-nested arity rule");
  assert.equal(inferredArity.metadataName, routes[1].metadataName, "the inferred arity matches the actual native declaration");
  console.log(JSON.stringify({ nativeInheritanceRoutes: routes }));
});

test("native root lookup retains assembly collisions and unsupported symbolic aliases on their original query routes", () => {
  const providers = ["Acme.Contracts", "Contoso.Contracts"].map(assembly => {
    const projectDirectory = resolve(repoRoot, "test/fixtures/dotnet-provider/assembly-identity", assembly);
    const reference = buildDotnetFixture({ project: resolve(projectDirectory, `${assembly}.csproj`), projectDirectory,
      outputDirectory: resolve(repoRoot, ".temp/native-root-identity", assembly, "bin"),
      intermediateDirectory: resolve(repoRoot, ".temp/native-root-identity", assembly, "obj"),
      outputAssemblyName: `${assembly}.dll` });
    return createDotnetReflectionTypeDataProvider({ references: [reference], disablePersistentCache: true,
      providerIdentity: { id: `native-root.${assembly}`, version: "1" } });
  });
  const resolver = createCsharpProviderRelationResolver({ providers, providerPolicies: [] });
  const bindings = providers.map(provider => resolvedNativeBinding(provider.findTargetBindingByMetadataName("Shared.Widget", "ordinary")));
  assert.equal(bindings.every(binding => binding !== undefined), true, "both actual native assemblies independently declare the same metadata name");
  assert.equal(bindings[0].id === bindings[1].id, false, "same metadata name does not erase assembly identity");
  for (const binding of bindings) {
    const route = csharpNativeInheritanceLookup(binding.csharpType);
    assert.equal(route.kind, "target-id", "a physical carrier is never rerouted to an ambiguous name");
    assert.equal(resolvedNativeBinding(resolver.findTargetBindingByTargetId(route.targetId, "ordinary"))?.id,
      binding.id, "each physical route selects only its actual assembly");
  }
  const symbolic = { kind: "target-named", id: "Shared.Widget", csharpAllowsRefLikeTypeArguments: [],
    csharpRender: { kind: "named", namespace: ["Shared"], name: "Widget" } };
  const named = csharpNativeInheritanceLookup(symbolic);
  assert.equal(named.kind, "metadata-name", "an exact symbolic native name selects one metadata query");
  const original = resolver.findTargetBindingByMetadataName("Shared.Widget", "inheritance");
  const rejected = resolver.findTargetBindingByMetadataName(named.metadataName, "inheritance");
  assert.equal(rejected.kind, "rejected", "two complete native winners are never silently selected");
  assert.equal(rejected.diagnostic.extensionCode, "CSHARP_PROVIDER_TARGET_BINDING_CONFLICT", "the existing query-local rejection owns ambiguity");
  assert.equal(rejected.diagnostic.extensionCode, original.diagnostic.extensionCode, "the original diagnostic code is unchanged");
  assert.equal(rejected.diagnostic.message, original.diagnostic.message, "the original diagnostic message is unchanged");
  for (const [label, type] of [
    ["unmatched symbolic alias", { ...symbolic, id: "Unsupported.WidgetAlias" }],
    ["extern alias", { ...symbolic, csharpRender: { ...symbolic.csharpRender, externAlias: "Selected" } }],
    ["using namespace", { ...symbolic, csharpRender: { ...symbolic.csharpRender, usingNamespace: ["Shared"] } }],
    ["absent explicit render", { ...symbolic, csharpRender: undefined }],
    ["unqualified render", { ...symbolic, csharpRender: { kind: "named", name: "Widget" } }],
  ]) {
    const route = csharpNativeInheritanceLookup(type);
    assert.equal(route.kind, "target-id", `${label}: there is no alias, spelling parse or fallback`);
    assert.equal(route.targetId, type.id, `${label}: the exact original query is retained`);
    assert.equal(resolver.findTargetBindingByTargetId(route.targetId, "ordinary").kind, "missing",
      `${label}: unsupported identity remains missing`);
    const direct = resolver.findTargetBindingByTargetId(type.id, "inheritance");
    const selected = resolver.findTargetBindingByTargetId(route.targetId, "inheritance");
    assert.equal(selected.kind, "rejected", `${label}: retained inheritance cannot invent a native view`);
    assert.equal(selected.diagnostic.extensionCode, direct.diagnostic.extensionCode, `${label}: original rejection code`);
    assert.equal(selected.diagnostic.message, direct.diagnostic.message, `${label}: original rejection message`);
  }
});

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
  assert.equal(Object.hasOwn(index, "getUniqueByMetadataName"), false, "the ambiguity-collapsing getter is removed, not retained as a compatibility route");
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

function nativeSlotObservation() {
  if (capturedNativeSlotObservation !== undefined) return capturedNativeSlotObservation;
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
  console.log(`native-slot-oracle native-stdout=${observed.stdout.trim()}`);
  const nativeObserved = JSON.parse(observed.stdout);
  const pointerProvider = createDotnetReflectionTypeDataProvider({
    references: [fixture().reference, resolve(directory, "bin/Debug/net10.0/NativeSlotOracle.dll")], disablePersistentCache: true,
  });
  const pointers = getCompleteDotnetModule(pointerProvider, "@tsonic/dotnet/NativeSlotOracle.js");
  assert.equal("exports" in pointers, true, "real function-pointer override metadata acquisition");
  const declarations = [...fixture().module.exports, ...pointers.exports].filter(entry => entry.kind === "type");
  capturedNativeSlotObservation = { nativeObserved, pointerProvider, declarations };
  return capturedNativeSlotObservation;
}

test("the one metadata-only base-slot producer agrees with actual native GetBaseDefinition across the complete slot family", () => {
  const { nativeObserved, declarations } = nativeSlotObservation();
  const expected = nativeObserved.slots;
  assert.equal(expected.length >= 30, true, "the oracle covers complete methods, accessors and physical signature families");
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
  const overloads = expected.filter(entry => entry.label === "FunctionPointerSignatures.Overload");
  assert.equal(overloads.length, 2, "both actual native width overloads remain present");
  assert.equal(new Set(overloads.map(entry => entry.id)).size, 2,
    "different physical function-pointer signatures cannot collapse to the same method id");
  const signatureOwner = declarations.find(entry => entry.metadataName === "NativeSlotOracle.FunctionPointerSignatures");
  assert.equal(signatureOwner !== undefined, true, "the exact native constructor, operator and indexer owner is retained");
  for (const identity of nativeObserved.signatures) {
    const retained = [...signatureOwner.members, ...(signatureOwner.unsupportedMembers ?? [])]
      .find(member => member.targetId === identity.id);
    assert.equal(retained !== undefined, true, `the canonical native identity reaches ${identity.kind}`);
    assert.equal(retained.metadataName, identity.metadataName, `the exact published native ${identity.kind} metadata description is retained`);
    assert.equal(retained.signatures?.some(signature => signature.id === identity.signatureId), true,
      `the exact independent native ${identity.kind} physical signature is retained`);
  }
  const pointerIdentity = name => {
    const entry = expected.find(row => row.label === `FunctionPointerSignatures.${name}`);
    assert.equal(entry !== undefined, true, `${name}: the native inverse control is retained`);
    return entry.id.slice(entry.id.indexOf("fnptr:"), -1);
  };
  for (const inverse of ["Stdcall", "WideResult", "Suppressed"])
    assert.equal(pointerIdentity("Cdecl") === pointerIdentity(inverse), false,
      `${inverse}: calling convention, native width and optional modifiers keep exact distinct identities`);
  const suppressedIdentity = JSON.parse(pointerIdentity("Suppressed").slice("fnptr:".length));
  assert.equal(suppressedIdentity.result.optionalModifiers.some(modifier =>
    modifier.endsWith("::System.Runtime.CompilerServices.CallConvSuppressGCTransition")), true,
  "the native optional calling-convention modifier is retained separately from required modifiers");
  console.log(`native-slot-oracle observations=${expected.length}`);
});

test("one native provider preserves both complete assembly candidates instead of turning ambiguity into missing", () => {
  const references = ["Acme.Contracts", "Contoso.Contracts"].map(assembly => {
    const projectDirectory = resolve(repoRoot, "test/fixtures/dotnet-provider/assembly-identity", assembly);
    return buildDotnetFixture({ project: resolve(projectDirectory, `${assembly}.csproj`), projectDirectory,
      outputDirectory: resolve(repoRoot, ".temp/native-root-identity", assembly, "bin"),
      intermediateDirectory: resolve(repoRoot, ".temp/native-root-identity", assembly, "obj"), outputAssemblyName: `${assembly}.dll` });
  });
  const bindings = references.map(reference => resolvedNativeBinding(createDotnetReflectionTypeDataProvider({
    references: [reference], disablePersistentCache: true,
  }).findTargetBindingByMetadataName("Shared.Widget", "ordinary")));
  const provider = createDotnetReflectionTypeDataProvider({ references, disablePersistentCache: true });
  for (const purpose of ["ordinary", "inheritance"]) for (const phase of ["cold", "warm"]) {
    const result = provider.findTargetBindingByMetadataName("Shared.Widget", purpose);
    assert.equal(result.kind, "rejected", `${purpose}/${phase}: both complete winners remain visible`);
    assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_TARGET_BINDING_CONFLICT", `${purpose}/${phase}: original owner code`);
    assert.equal(result.diagnostic.numericCode, 9200000, `${purpose}/${phase}: original numeric code`);
    assert.equal(result.diagnostic.message, "C# providers supplied contradictory complete target binding evidence.",
      `${purpose}/${phase}: original conflict message`);
    assert.equal(result.diagnostic.evidence[0].details.query, "Shared.Widget", `${purpose}/${phase}: exact query evidence`);
    assert.deepEqual([...result.diagnostic.evidence[0].details.bindingIds].sort(), bindings.map(binding => binding.id).sort(),
      `${purpose}/${phase}: both independently acquired physical identities`);
  }
  for (const binding of bindings)
    assert.equal(resolvedNativeBinding(provider.findTargetBindingByTargetId(binding.id, "ordinary")).id, binding.id,
      "an ambiguous metadata name does not poison either physical lookup");
  assert.equal(provider.findTargetBindingByMetadataName("Shared.Absent", "ordinary").kind, "missing", "a genuine nonmatch remains missing");
});

test("open and nested-open native chains and override owners retain the actual generic-definition identity", () => {
  const { nativeObserved, declarations } = nativeSlotObservation();
  for (const observed of nativeObserved.openDeclarations) {
    const selected = declarations.find(entry => entry.metadataName === observed.metadataName);
    assert.equal(selected !== undefined, true, `${observed.metadataName}: real native declaration retained`);
    assert.equal(selected.targetId, observed.id, `${observed.metadataName}: actual definition FullName and assembly`);
    assert.deepEqual(selected.inheritance.map(entry => entry.targetId), observed.chain.map(entry => entry.id),
      `${observed.metadataName}: every partially open base has its physical declaration identity`);
    for (const entry of selected.inheritance.filter(entry => entry.type.kind === "named"))
      assert.equal(entry.targetId, entry.type.targetId, `${observed.metadataName}: the strict chain invariant remains exact`);
  }
  const generic = declaration("NativeBase");
  assert.deepEqual(generic.typeParameters.map(parameter => parameter.identity), nativeObserved.genericParameters,
    "the original generic-parameter identity remains actual module, owner token and position");
  for (const identity of nativeObserved.closedPhysicalIdentities)
    assert.equal(declarations.some(entry => entry.targetId === identity), true, "every original closed physical declaration identity is unchanged");
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", { requestedMetadataNames: ["System.Lazy`2"] });
  assert.equal("exports" in module, true, "the original strict Lazy module is admitted without validator relaxation");
  const lazy = [...module.exports, ...(module.targetOnlyTypes ?? [])].find(entry => entry.metadataName === "System.Lazy`2");
  assert.equal(lazy !== undefined, true, "actual native Lazy<T,TMetadata> retained");
  assert.equal(lazy.inheritance[1].targetId.endsWith("::System.Lazy`1"), true, "the partially open Lazy<T> base retains System");
  assert.equal(lazy.inheritance[1].targetId, lazy.inheritance[1].type.targetId, "exact raw Lazy chain identity correspondence");
  console.log(JSON.stringify({ nativeOpenDeclarations: nativeObserved.openDeclarations }));
});

test("unsupported recursive-delegate function pointers keep exact member evidence and structured rejection descriptions", () => {
  const { nativeObserved, pointerProvider } = nativeSlotObservation();
  const module = getCompleteDotnetModule(pointerProvider, "@tsonic/dotnet/NativeFailureOracle.js");
  assert.equal("exports" in module, true, "unsupported source shapes do not unwind the native provider");
  const host = module.exports.find(entry => entry.kind === "type" && entry.metadataName === "NativeFailureOracle.PointerHost");
  assert.equal(host !== undefined, true, "the real unsupported-member owner is retained");
  for (const observed of nativeObserved.failures) {
    const member = host.unsupportedMembers.find(entry => entry.targetId === observed.id);
    assert.equal(member !== undefined, true, `${observed.label}: exact independent physical identity retained`);
    assert.equal(member.memberKind, observed.kind, `${observed.label}: unsupported member category retained`);
    const signatureReason = `Function-pointer signature '${observed.signature}' contains a type that is not representable by the provider.`;
    const reason = observed.context === "array"
      ? `Field type cannot be represented as closed .NET target type facts. Array element type '${observed.signature}' is not representable. ${signatureReason}`
      : observed.context === "parameter" || observed.context === "constructor" || observed.context === "index-parameter"
        ? `${observed.context === "constructor" ? "Constructor" : observed.context === "index-parameter" ? "Indexer" : "Method"} signature contains parameter 'callback' with type '${observed.signature}' that cannot be represented as closed .NET target type facts. ${signatureReason}`
        : `${observed.context} cannot be represented as closed .NET target type facts. ${signatureReason}`;
    assert.equal(member.reason, reason, `${observed.label}: original complete contextual reason with exact modified signature`);
    if (observed.kind === "method") {
      const slot = host.inheritableMembers.flatMap(entry => entry.dispatchSlots).find(entry => entry.id === observed.id);
      assert.equal(slot !== undefined, true, `${observed.label}: source rejection does not erase physical native inventory`);
      assert.equal(observed.context === "Method return type" ? slot.returnType.kind === "function-pointer"
        : slot.parameters[0].type.kind === "function-pointer", true, `${observed.label}: physical signature facts remain available`);
    }
  }
  const sibling = host.members.find(entry => entry.targetName === "Ping");
  assert.equal(sibling !== undefined, true, "the usable sibling is not poisoned by a rejected native source shape");
  assert.equal(sibling.signatures[0].returnType.name, "int32", "the usable sibling retains its exact native result width");
});

test("native function-pointer arrays in nominal interfaces and constraints fail structurally without inventing an identity", () => {
  const { pointerProvider } = nativeSlotObservation();
  const module = getCompleteDotnetModule(pointerProvider, "@tsonic/dotnet/NativeFailureOracle.js");
  assert.equal("exports" in module, true, "the selected compiler's real accepted nominal pointer-array input remains structured metadata");
  const implemented = module.exports.find(entry => entry.kind === "type" && entry.metadataName === "NativeFailureOracle.PointerArrayHolder");
  const constrained = module.exports.find(entry => entry.kind === "type" && entry.metadataName === "NativeFailureOracle.PointerArrayConstraint`1");
  const reason = "A type containing a function-pointer signature cannot be represented as closed source facts without exact member-bound signature evidence.";
  assert.equal(implemented !== undefined && constrained !== undefined, true, "both actual native nominal failure audiences are retained");
  assert.equal(implemented.unsupportedImplementedContracts.length, 1, "one original unsupported implemented-contract fact");
  assert.equal(implemented.unsupportedImplementedContracts[0].reason,
    `Implemented contract type cannot be represented as closed .NET target type facts. ${reason}`, "nominal interface reason contains no fabricated signature identity");
  assert.equal(constrained.typeParameters[0].unsupportedConstraints.length, 1, "one original unsupported native constraint fact");
  assert.equal(constrained.typeParameters[0].unsupportedConstraints[0].reason,
    `Generic constraint type cannot be represented as closed .NET target type facts. ${reason}`, "nominal constraint reason contains no fabricated signature identity");
});

const nativeSlotOracleSource = String.raw`
using System.Reflection;
using System.Text.Json;
using InheritanceProviderFixtures;

var types = new[] { typeof(SlotBase<>), typeof(SlotDerived), typeof(MiddleSlot), typeof(LastSlot),
    typeof(CovariantBase), typeof(CovariantDerived), typeof(SameNameBase), typeof(SameNameDerived),
    typeof(DispatchBase<>), typeof(DispatchDerived), typeof(NativeSlotOracle.FunctionPointerBase),
    typeof(NativeSlotOracle.FunctionPointerDerived), typeof(NativeSlotOracle.FunctionPointerSignatures),
    typeof(OpenSlotDerived<>), typeof(OpenOuter<>.Nested<>) };
var rows = types.SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic |
    BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
    .Where(method => method.IsPublic || method.IsFamily || method.IsFamilyOrAssembly)
    // Inheritance.cs:30 excludes special-name method rows; this new operator is proven separately by its exact native group and signature.
    .Where(method => !(method.DeclaringType == typeof(NativeSlotOracle.FunctionPointerSignatures) && method.Name == "op_Addition"))
    .Select(method => new { label = type.Name + "." + method.Name, id = MethodId(method),
        baseDefinitionId = MethodId(method.GetBaseDefinition()), @virtual = method.IsVirtual,
        @abstract = method.IsAbstract, final = method.IsFinal })).ToArray();
var identityOwner = typeof(NativeSlotOracle.FunctionPointerSignatures);
var signatures = identityOwner.GetConstructors().Select(constructor =>
    {
        var id = TargetId(identityOwner) + "..ctor(" + Parameters(constructor.GetParameters()) + ")";
        return new { kind = "constructor", id, signatureId = id,
            metadataName = identityOwner.FullName + "..ctor(" + MetadataParameters(constructor.GetParameters()) + ")" };
    })
    .Concat(identityOwner.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
        .Where(property => property.GetIndexParameters().Length != 0).Select(property =>
        {
            var id = TargetId(identityOwner) + "." + property.Name + "(" + Parameters(property.GetIndexParameters()) + ")";
            return new { kind = "indexer", id, signatureId = id,
                metadataName = identityOwner.FullName + "." + property.Name + "(" + MetadataParameters(property.GetIndexParameters()) + ")" };
        }))
    .Concat(identityOwner.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
        .Where(method => method.Name == "op_Addition").Select(method => new
        { kind = "operator", id = TargetId(identityOwner) + "." + method.Name,
          signatureId = MethodId(method) + ":" + TypeId(method.ReturnType, method.ReturnParameter.GetModifiedParameterType()),
          metadataName = identityOwner.FullName + "." + method.Name }))
    .ToArray();
var openDeclarations = new[] { typeof(OpenSlotDerived<>), typeof(OpenOuter<>.Nested<>) }.Select(type => new
{
    metadataName = type.FullName!.Replace('+', '.'),
    id = TargetId(type),
    chain = Chain(type).Select(entry => new
    {
        id = TargetId(entry),
        declaringType = entry.ToString(),
        genericDefinitionFullName = (entry.IsGenericType ? entry.GetGenericTypeDefinition() : entry).FullName,
        assembly = entry.Assembly.GetName().FullName,
    }).ToArray(),
}).ToArray();
var failureOwner = typeof(NativeFailureOracle.PointerHost);
var field = failureOwner.GetField("Callback")!;
var property = failureOwner.GetProperty("CallbackProperty")!;
var accept = failureOwner.GetMethod("Accept")!;
var returns = failureOwner.GetMethod("Return")!;
var nested = failureOwner.GetMethod("AcceptNested")!;
var constructor = failureOwner.GetConstructors().Single();
var indexedReturn = failureOwner.GetProperties().Single(entry => entry.GetIndexParameters().Length != 0 && entry.PropertyType.IsFunctionPointer);
var indexedParameter = failureOwner.GetProperties().Single(entry => entry.GetIndexParameters().Length != 0 && entry.GetIndexParameters()[0].ParameterType.IsFunctionPointer);
var array = failureOwner.GetField("CallbackArray")!;
var failures = new[]
{
    new { label = "field", kind = "field", id = TargetId(failureOwner) + ".Callback", signature = TypeId(field.FieldType, field.GetModifiedFieldType()), context = "Field type" },
    new { label = "property", kind = "property", id = TargetId(failureOwner) + ".CallbackProperty", signature = TypeId(property.PropertyType, property.GetModifiedPropertyType()), context = "Property type" },
    new { label = "parameter", kind = "method", id = MethodId(accept), signature = TypeId(accept.GetParameters()[0].ParameterType, accept.GetParameters()[0].GetModifiedParameterType()), context = "parameter" },
    new { label = "return", kind = "method", id = MethodId(returns), signature = TypeId(returns.ReturnType, returns.ReturnParameter.GetModifiedParameterType()), context = "Method return type" },
    new { label = "nested-parameter", kind = "method", id = MethodId(nested), signature = TypeId(nested.GetParameters()[0].ParameterType, nested.GetParameters()[0].GetModifiedParameterType()), context = "parameter" },
    new { label = "constructor", kind = "constructor", id = TargetId(failureOwner) + "..ctor(" + Parameters(constructor.GetParameters()) + ")", signature = TypeId(constructor.GetParameters()[0].ParameterType, constructor.GetParameters()[0].GetModifiedParameterType()), context = "constructor" },
    new { label = "indexer-return", kind = "indexer", id = TargetId(failureOwner) + ".Item(" + Parameters(indexedReturn.GetIndexParameters()) + ")", signature = TypeId(indexedReturn.PropertyType, indexedReturn.GetModifiedPropertyType()), context = "Indexer return type" },
    new { label = "indexer-parameter", kind = "indexer", id = TargetId(failureOwner) + ".Item(" + Parameters(indexedParameter.GetIndexParameters()) + ")", signature = TypeId(indexedParameter.GetIndexParameters()[0].ParameterType, indexedParameter.GetIndexParameters()[0].GetModifiedParameterType()), context = "index-parameter" },
    new { label = "array-field", kind = "field", id = TargetId(failureOwner) + ".CallbackArray", signature = TypeId(array.FieldType.GetElementType()!, array.GetModifiedFieldType().GetElementType()), context = "array" },
};
var genericParameters = typeof(NativeBase<>).GetGenericArguments().Select(parameter =>
    $"{parameter.DeclaringType!.Module.ModuleVersionId:D}:{parameter.DeclaringType.MetadataToken:x8}:{parameter.GenericParameterPosition}").ToArray();
Console.WriteLine(JsonSerializer.Serialize(new { slots = rows, signatures, openDeclarations, failures, genericParameters,
    closedPhysicalIdentities = types.Where(type => !type.ContainsGenericParameters).Select(TargetId).ToArray() }));

static IEnumerable<Type> Chain(Type type)
{
    for (Type? current = type; current is not null; current = current.BaseType) yield return current;
}

static string MethodId(MethodInfo method) => TargetId(method.DeclaringType!) + "." + method.Name +
    (method.IsGenericMethodDefinition ? "\u0060\u0060" + method.GetGenericArguments().Length : "") +
    "(" + Parameters(method.GetParameters()) + ")";
static string Parameters(ParameterInfo[] parameters) => string.Join(",", parameters.Select(ParameterId));
static string MetadataParameters(ParameterInfo[] parameters) => string.Join(",", parameters.Select(parameter =>
    parameter.ParameterType.IsFunctionPointer ? TypeId(parameter.ParameterType, parameter.GetModifiedParameterType())
        : parameter.ParameterType.FullName!.Replace('+', '.')));
static string ParameterId(ParameterInfo parameter)
{
    var type = parameter.ParameterType.IsByRef ? parameter.ParameterType.GetElementType()! : parameter.ParameterType;
    var modified = parameter.GetModifiedParameterType();
    var name = TypeId(type, parameter.ParameterType.IsByRef ? modified.GetElementType()! : modified);
    if (!parameter.ParameterType.IsByRef) return name;
    if (parameter.IsOut) return "out " + name;
    return parameter.GetCustomAttributesData().Any(attribute => attribute.AttributeType == typeof(System.Runtime.InteropServices.InAttribute))
        ? "in " + name : "ref " + name;
}
static string TypeId(Type type, Type? modified = null)
{
    if (type.IsFunctionPointer)
    {
        if (modified is null) throw new InvalidOperationException("The independent native oracle requires a modified pointer type.");
        var rawParameters = type.GetFunctionPointerParameterTypes();
        var nativeParameters = modified.GetFunctionPointerParameterTypes();
        return "fnptr:" + JsonSerializer.Serialize(new
        {
            abi = (type.IsUnmanagedFunctionPointer ? new[] { "unmanaged" } : ["managed"])
                .Concat(modified.GetFunctionPointerCallingConventions().Select(convention => convention.FullName switch
                {
                    "System.Runtime.CompilerServices.CallConvCdecl" => "Cdecl",
                    "System.Runtime.CompilerServices.CallConvStdcall" => "Stdcall",
                    "System.Runtime.CompilerServices.CallConvSuppressGCTransition" => "SuppressGCTransition",
                    _ => throw new InvalidOperationException("The handwritten native control contains an unlisted calling convention."),
                }).OrderBy(name => name, StringComparer.Ordinal)).Distinct(StringComparer.Ordinal).ToArray(),
            parameters = rawParameters.Select((parameter, index) => NativeTypeIdentity(parameter, nativeParameters[index])).ToArray(),
            result = NativeTypeIdentity(type.GetFunctionPointerReturnType(), modified.GetFunctionPointerReturnType()),
            requiredModifiers = modified.GetRequiredCustomModifiers().Select(TargetId).ToArray(),
            optionalModifiers = modified.GetOptionalCustomModifiers().Select(TargetId).ToArray(),
        });
    }
    if (type.IsArray) return TypeId(type.GetElementType()!, modified?.GetElementType()) +
        (type.IsSZArray ? "[]" : type.GetArrayRank() == 1 ? "[*]" : "[" + new string(',', type.GetArrayRank() - 1) + "]");
    if (type.IsGenericParameter) return type.Name;
    if (type.IsGenericType && !type.IsGenericTypeDefinition) return TargetId(type.GetGenericTypeDefinition()) +
        "<" + string.Join(",", type.GetGenericArguments().Select(argument => TypeId(argument))) + ">";
    return TargetId(type);
}
static object NativeTypeIdentity(Type type, Type modified) => new
{
    type = type.IsByRef ? "byref:" + TypeId(type.GetElementType()!, modified.GetElementType()) : TypeId(type, modified),
    requiredModifiers = modified.GetRequiredCustomModifiers().Select(TargetId).ToArray(),
    optionalModifiers = modified.GetOptionalCustomModifiers().Select(TargetId).ToArray(),
};
static string TargetId(Type type)
{
    var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
    var name = definition.FullName ?? throw new InvalidOperationException($"Native physical declaration '{type}' has no full name.");
    return type.Assembly.GetName().FullName + "::" + name;
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
    public unsafe class FunctionPointerSignatures
    {
        public FunctionPointerSignatures(delegate* unmanaged[Cdecl]<int, int> callback) { }
        public int this[delegate* unmanaged[Cdecl]<int, int> callback] => 0;
        public static int operator +(FunctionPointerSignatures value, delegate* unmanaged[Cdecl]<int, int> callback) => 0;
        public virtual int Overload(delegate* unmanaged[Cdecl]<int, int> callback) => 0;
        public virtual int Overload(delegate* unmanaged[Cdecl]<long, int> callback) => 0;
        public virtual int Cdecl(delegate* unmanaged[Cdecl]<int, int> callback) => 0;
        public virtual int Stdcall(delegate* unmanaged[Stdcall]<int, int> callback) => 0;
        public virtual int WideResult(delegate* unmanaged[Cdecl]<int, long> callback) => 0;
        public virtual int Suppressed(delegate* unmanaged[Cdecl, SuppressGCTransition]<int, int> callback) => 0;
    }
}

namespace NativeFailureOracle
{
    public delegate void SelfRecursive(SelfRecursive next);
    public unsafe sealed class PointerHost
    {
        public delegate*<SelfRecursive, void> Callback;
        public delegate*<SelfRecursive, void>[] CallbackArray = [];
        public PointerHost(delegate*<SelfRecursive, void> callback) { Callback = callback; }
        public delegate*<SelfRecursive, void> CallbackProperty { get => Callback; set => Callback = value; }
        public void Accept(delegate*<SelfRecursive, void> callback) { }
        public void AcceptNested(delegate*<delegate*<SelfRecursive, void>, void> callback) { }
        public delegate*<SelfRecursive, void> Return() => Callback;
        public delegate*<SelfRecursive, void> this[int index] => Callback;
        public int this[delegate*<SelfRecursive, void> callback] => 0;
        public int Ping() => 1;
    }
    public interface IHolder<T> { }
    public unsafe sealed class PointerArrayHolder : IHolder<delegate* unmanaged<void>[]> { }
    public unsafe sealed class PointerArrayConstraint<T> where T : IHolder<delegate* unmanaged<void>[]> { }
}
`;
