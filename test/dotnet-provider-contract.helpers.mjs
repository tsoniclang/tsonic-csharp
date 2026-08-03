import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
  createDotnetSourceDeclarationProvider,
  dotnetModuleToProviderDeclarationModel,
  dotnetNativeArrayTypeId,
  validateDotnetModuleModelContract,
  validateDotnetProviderDeclarationModelContract,
} from "../dist/index.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";
export { assert, mkdirSync, writeFileSync, dirname, join, test, fileURLToPath, createDotnetReflectionTypeDataProvider, createDotnetSourceDeclarationProvider, dotnetModuleToProviderDeclarationModel, dotnetNativeArrayTypeId, validateDotnetModuleModelContract, validateDotnetProviderDeclarationModelContract, buildDotnetFixture };

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const testAssemblyId = "Provider.Contract.Tests, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null";
export const supportedPassingModes = new Set([
  "by-value",
  "byref-readonly",
  "byref-readwrite",
  "byref-writeonly-must-init",
]);
















export function testTargetId(metadataName) {
  return `${testAssemblyId}::${metadataName}`;
}

export function hasEvidencePath(diagnostic, path) {
  return diagnostic?.evidence?.some((entry) => entry.path === path) === true;
}

export function assertRawModuleContractInvariants(module) {
  assert.equal(typeof module.moduleSpecifier, "string");
  assert.equal(typeof module.namespaceName, "string");
  if (module.assembly !== undefined) {
    assertAssemblyReference(module.assembly, "$.assembly");
  }
  for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
    if (declaration.kind !== "type") {
      continue;
    }
    assertTargetIdentity(declaration.targetId, declaration.metadataName, `${declaration.sourceName}.targetId`, declaration.assembly);
    if (declaration.assembly !== undefined) {
      assertAssemblyReference(declaration.assembly, `${declaration.sourceName}.assembly`);
    }
    walkDotnetTypeDeclarationRefs(declaration, (type, path) => assertDotnetTypeRefInvariant(type, `${declaration.sourceName}.${path}`));
    for (const parameter of declaration.typeParameters ?? []) {
      assertTypeParameterInvariant(parameter, `${declaration.sourceName}<${parameter.name}>`);
    }
    for (const member of declaration.members ?? []) {
      assertTargetIdentity(member.targetId, member.metadataName, `${declaration.sourceName}.${member.targetName}.targetId`);
      for (const signature of member.signatures ?? []) {
        assertRawSignatureInvariant(signature, `${declaration.sourceName}.${member.targetName}`);
      }
      if (member.kind === "event") {
        assert.ok(
          declaration.unsupportedMembers?.some((unsupported) =>
            unsupported.memberKind === "event" &&
            unsupported.targetId === member.targetId &&
            typeof unsupported.reason === "string" &&
            unsupported.reason.length > 0
          ),
          `Source-visible event '${declaration.sourceName}.${member.targetName}' must carry unsupported source-event evidence.`,
        );
      }
    }
    for (const unsupportedMember of declaration.unsupportedMembers ?? []) {
      assertTargetIdentity(unsupportedMember.targetId, unsupportedMember.metadataName, `${declaration.sourceName}.${unsupportedMember.targetName}.unsupportedTargetId`);
      assert.equal(typeof unsupportedMember.reason, "string");
      assert.notEqual(unsupportedMember.reason.length, 0);
    }
  }
  for (const unsupportedExport of module.unsupportedExports ?? []) {
    assert.equal(typeof unsupportedExport.reason, "string");
    assert.notEqual(unsupportedExport.reason.length, 0);
    if (unsupportedExport.kind === "unsupported-type-export") {
      assertTargetIdentity(unsupportedExport.targetId, unsupportedExport.metadataName, `${unsupportedExport.sourceName}.unsupportedTargetId`, unsupportedExport.assembly);
      continue;
    }
    assert.ok(Array.isArray(unsupportedExport.targetIds));
    assert.ok(Array.isArray(unsupportedExport.metadataNames));
    assert.equal(unsupportedExport.targetIds.length, unsupportedExport.metadataNames.length);
    for (const [index, targetId] of unsupportedExport.targetIds.entries()) {
      assertTargetIdentity(targetId, unsupportedExport.metadataNames[index], `${unsupportedExport.sourceName}.unsupportedTargetIds[${index}]`, unsupportedExport.assemblies?.[index]);
    }
  }
}

export function assertProviderDeclarationContractInvariants(model) {
  assert.equal(typeof model.moduleSpecifier, "string");
  assert.equal(typeof model.providerModuleId, "string");
  for (const declaration of model.exports) {
    assert.equal(Object.hasOwn(declaration, "targetIdentity"), false);
    assert.equal(typeof declaration.id, "string");
    assert.notEqual(declaration.id.length, 0);
    walkProviderExportRefs(declaration, (type, path) => assertProviderTypeExpressionInvariant(type, `${declaration.name}.${path}`));
  }
}

export function assertTargetBindingContractInvariants(provider, module) {
  for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
    if (declaration.kind !== "type") {
      continue;
    }
    const binding = provider.findTargetBindingByTargetId(declaration.targetId);
    assert.ok(binding, `Missing target binding for ${declaration.targetId}`);
    assert.equal(binding.id, declaration.targetId);
    assert.equal(binding.target, "csharp");
    if ((declaration.unsupportedMembers?.length ?? 0) > 0) {
      assert.equal(binding.unsupportedMembers?.length >= declaration.unsupportedMembers.length, true);
    }
    if ((declaration.unsupportedImplementedContracts?.length ?? 0) > 0) {
      assert.equal(binding.unsupportedImplementedContracts?.length >= declaration.unsupportedImplementedContracts.length, true);
    }
  }
}

export function assertRawSignatureInvariant(signature, path) {
  assert.equal(typeof signature.sourceId, "string", `${path}.sourceId`);
  assert.notEqual(signature.sourceId.length, 0, `${path}.sourceId`);
  for (const [index, parameter] of signature.parameters.entries()) {
    assert.equal(supportedPassingModes.has(parameter.passingMode), true, `${path}.parameters[${index}].passingMode`);
    walkDotnetTypeRef(parameter.type, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.parameters[${index}].type.${typePath}`));
    if (parameter.sourceType !== undefined) {
      walkDotnetTypeRef(parameter.sourceType, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.parameters[${index}].sourceType.${typePath}`));
    }
    if (parameter.rest === true) {
      assert.equal(index, signature.parameters.length - 1, `${path}.parameters[${index}].rest`);
      assert.equal(parameter.passingMode, "by-value", `${path}.parameters[${index}].rest.passingMode`);
      const targetType = parameter.type.kind === "nullable-reference"
        ? parameter.type.elementType
        : parameter.type;
      assert.equal(targetType.kind, "array", `${path}.parameters[${index}].rest.type`);
    }
    if (parameter.defaultValue !== undefined || parameter.unsupportedDefaultValue !== undefined) {
      assert.equal(parameter.optional, true, `${path}.parameters[${index}].default.optional`);
      assert.equal(parameter.defaultValue === undefined || parameter.unsupportedDefaultValue === undefined, true, `${path}.parameters[${index}].default.exclusive`);
    }
    if (parameter.unsupportedDefaultValue !== undefined) {
      assert.equal(typeof parameter.unsupportedDefaultValue.reason, "string");
      assert.notEqual(parameter.unsupportedDefaultValue.reason.length, 0);
    }
  }
  if (signature.returnType !== undefined) {
    walkDotnetTypeRef(signature.returnType, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.returnType.${typePath}`));
  }
  if (signature.targetReturnType !== undefined) {
    walkDotnetTypeRef(signature.targetReturnType, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.targetReturnType.${typePath}`));
  }
  for (const parameter of signature.typeParameters ?? []) {
    assertTypeParameterInvariant(parameter, `${path}.${parameter.name}`);
  }
}

export function assertTypeParameterInvariant(parameter, path) {
  assert.equal(typeof parameter.name, "string", path);
  assert.notEqual(parameter.name.length, 0, path);
  if (parameter.variance !== undefined) {
    assert.ok(["in", "out", "invariant", "target-defined"].includes(parameter.variance), `${path}.variance`);
  }
  for (const constraint of parameter.constraints ?? []) {
    if (constraint.kind === "implements") {
      walkDotnetTypeRef(constraint.contract, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.constraint.${typePath}`));
    }
  }
}

export function assertDotnetTypeRefInvariant(type, path) {
  if (type.kind === "provider-ref") {
    assert.equal(typeof type.moduleSpecifier, "string", `${path}.moduleSpecifier`);
    assert.notEqual(type.moduleSpecifier.length, 0, `${path}.moduleSpecifier`);
    assert.equal(typeof type.exportName, "string", `${path}.exportName`);
    assert.notEqual(type.exportName.length, 0, `${path}.exportName`);
    assert.equal("name" in type, false, `${path}.name`);
  }
  if (type.kind === "named") {
    assertTargetIdentity(type.targetId, type.metadataName, `${path}.targetId`);
  }
  if (type.kind === "array" && type.rank !== undefined) {
    assert.equal(Number.isInteger(type.rank) && type.rank >= 1, true, `${path}.rank`);
  }
}

export function assertProviderTypeExpressionInvariant(type, path) {
  if (type.kind === "provider-ref") {
    assert.equal(typeof type.moduleSpecifier, "string", `${path}.moduleSpecifier`);
    assert.notEqual(type.moduleSpecifier.length, 0, `${path}.moduleSpecifier`);
    assert.equal(typeof type.exportName, "string", `${path}.exportName`);
    assert.notEqual(type.exportName.length, 0, `${path}.exportName`);
    assert.equal("name" in type, false, `${path}.name`);
  }
  if (type.kind === "target-named") {
    assert.equal(type.target, "csharp", `${path}.target`);
    assert.equal(typeof type.id, "string", `${path}.id`);
    assert.notEqual(type.id.length, 0, `${path}.id`);
    assert.notEqual(type.sourceShape, undefined, `${path}.sourceShape`);
  }
  if (type.kind === "opaque") {
    assert.equal(typeof type.id, "string", `${path}.id`);
    assert.notEqual(type.id.length, 0, `${path}.id`);
    assert.notEqual(type.sourceShape, undefined, `${path}.sourceShape`);
  }
  if (type.kind === "function") {
    assert.equal(typeof type.id, "string", `${path}.id`);
    assert.notEqual(type.id.length, 0, `${path}.id`);
  }
}

export function assertAssemblyReference(reference, path) {
  assert.equal(typeof reference.name, "string", `${path}.name`);
  assert.notEqual(reference.name.length, 0, `${path}.name`);
  if (reference.version !== undefined) {
    assert.equal(typeof reference.version, "string", `${path}.version`);
    assert.notEqual(reference.version.length, 0, `${path}.version`);
  }
  if (reference.path !== undefined) {
    assert.equal(typeof reference.path, "string", `${path}.path`);
    assert.notEqual(reference.path.length, 0, `${path}.path`);
  }
}

export function assertTargetIdentity(targetId, metadataName, path, assembly) {
  assert.equal(typeof targetId, "string", path);
  assert.notEqual(targetId.length, 0, path);
  assert.equal(typeof metadataName, "string", `${path}.metadataName`);
  assert.notEqual(metadataName.length, 0, `${path}.metadataName`);
  assert.notEqual(targetId, metadataName, `${path} must not fall back to metadataName`);
  if (assembly !== undefined) {
    assert.match(targetId, /::/u, `${path} must be assembly-qualified`);
  }
}

export function walkDotnetTypeDeclarationRefs(declaration, visit) {
  for (const type of [
    declaration.baseType,
    declaration.sourceShape,
    declaration.targetType,
  ]) {
    if (type !== undefined) {
      walkDotnetTypeRef(type, visit);
    }
  }
  for (const constraint of declaration.implementedContracts ?? []) {
    if (constraint.kind === "implements") {
      walkDotnetTypeRef(constraint.contract, visit);
    }
  }
  for (const parameter of declaration.typeParameters ?? []) {
    if (parameter.defaultType !== undefined) {
      walkDotnetTypeRef(parameter.defaultType, visit);
    }
  }
  for (const member of declaration.members ?? []) {
    if (member.type !== undefined) {
      walkDotnetTypeRef(member.type, visit);
    }
    for (const signature of member.signatures ?? []) {
      for (const parameter of signature.parameters) {
        walkDotnetTypeRef(parameter.type, visit);
        if (parameter.sourceType !== undefined) {
          walkDotnetTypeRef(parameter.sourceType, visit);
        }
      }
      if (signature.returnType !== undefined) {
        walkDotnetTypeRef(signature.returnType, visit);
      }
      if (signature.targetReturnType !== undefined) {
        walkDotnetTypeRef(signature.targetReturnType, visit);
      }
    }
  }
}

export function walkDotnetTypeRef(type, visit, path = "$") {
  visit(type, path);
  switch (type.kind) {
    case "provider-ref":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkDotnetTypeRef(argument, visit, `${path}.typeArguments[${index}]`);
      }
      return;
    case "named":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkDotnetTypeRef(argument, visit, `${path}.typeArguments[${index}]`);
      }
      if (type.sourceShape !== undefined) {
        walkDotnetTypeRef(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    case "array":
      walkDotnetTypeRef(type.elementType, visit, `${path}.elementType`);
      return;
    case "nullable":
      walkDotnetTypeRef(type.elementType, visit, `${path}.elementType`);
      return;
    case "tuple":
      for (const [index, element] of type.elements.entries()) {
        walkDotnetTypeRef(element, visit, `${path}.elements[${index}]`);
      }
      return;
    case "union":
      for (const [index, element] of type.types.entries()) {
        walkDotnetTypeRef(element, visit, `${path}.types[${index}]`);
      }
      return;
    case "function":
      for (const [index, parameter] of type.parameters.entries()) {
        walkDotnetTypeRef(parameter.type, visit, `${path}.parameters[${index}].type`);
        if (parameter.sourceType !== undefined) {
          walkDotnetTypeRef(parameter.sourceType, visit, `${path}.parameters[${index}].sourceType`);
        }
      }
      walkDotnetTypeRef(type.returnType, visit, `${path}.returnType`);
      return;
    case "pointer":
      walkDotnetTypeRef(type.pointee, visit, `${path}.pointee`);
      return;
    case "function-pointer":
      for (const [index, argument] of type.args.entries()) {
        walkDotnetTypeRef(argument, visit, `${path}.args[${index}]`);
      }
      walkDotnetTypeRef(type.result, visit, `${path}.result`);
      return;
    case "opaque":
      if (type.sourceShape !== undefined) {
        walkDotnetTypeRef(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    default:
      return;
  }
}

export function walkProviderExportRefs(declaration, visit) {
  if (declaration.type !== undefined) {
    walkProviderTypeExpression(declaration.type, visit);
  }
  for (const parameter of declaration.typeParameters ?? []) {
    for (const constraint of parameter.constraints ?? []) {
      walkProviderTypeExpression(constraint, visit);
    }
    if (parameter.defaultType !== undefined) {
      walkProviderTypeExpression(parameter.defaultType, visit);
    }
  }
  for (const heritage of declaration.heritage ?? []) {
    walkProviderTypeExpression(heritage.type, visit);
  }
  for (const member of declaration.members ?? []) {
    if (member.type !== undefined) {
      walkProviderTypeExpression(member.type, visit);
    }
    for (const signature of member.signatures ?? []) {
      for (const parameter of signature.parameters) {
        walkProviderTypeExpression(parameter.type, visit);
      }
      if (signature.returnType !== undefined) {
        walkProviderTypeExpression(signature.returnType, visit);
      }
    }
  }
  for (const signature of declaration.signatures ?? []) {
    for (const parameter of signature.parameters) {
      walkProviderTypeExpression(parameter.type, visit);
    }
    if (signature.returnType !== undefined) {
      walkProviderTypeExpression(signature.returnType, visit);
    }
  }
}

export function walkProviderTypeExpression(type, visit, path = "$") {
  visit(type, path);
  switch (type.kind) {
    case "provider-ref":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkProviderTypeExpression(argument, visit, `${path}.typeArguments[${index}]`);
      }
      return;
    case "target-named":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkProviderTypeExpression(argument, visit, `${path}.typeArguments[${index}]`);
      }
      if (type.sourceShape !== undefined) {
        walkProviderTypeExpression(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    case "array":
      walkProviderTypeExpression(type.elementType, visit, `${path}.elementType`);
      return;
    case "tuple":
      for (const [index, element] of type.elementTypes.entries()) {
        walkProviderTypeExpression(element, visit, `${path}.elementTypes[${index}]`);
      }
      return;
    case "union":
    case "intersection":
      for (const [index, element] of type.types.entries()) {
        walkProviderTypeExpression(element, visit, `${path}.types[${index}]`);
      }
      return;
    case "function":
      for (const [index, parameter] of type.parameters.entries()) {
        walkProviderTypeExpression(parameter.type, visit, `${path}.parameters[${index}].type`);
      }
      walkProviderTypeExpression(type.returnType, visit, `${path}.returnType`);
      return;
    case "opaque":
      if (type.sourceShape !== undefined) {
        walkProviderTypeExpression(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    default:
      return;
  }
}

export function rawType(module, sourceName) {
  const declaration = module.exports.find((candidate) => candidate.kind === "type" && candidate.sourceName === sourceName);
  assert.ok(declaration, `Missing raw type ${sourceName}`);
  return declaration;
}

export function rawMethod(type, sourceName, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.sourceName === sourceName &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing method ${type.sourceName}.${sourceName} with signature ${signatureShape}`);
  return member;
}

export function sourceType(model, sourceName) {
  const declaration = model.exports.find((candidate) => candidate.name === sourceName);
  assert.ok(declaration, `Missing source type ${sourceName}`);
  return declaration;
}

export function sourceMember(type, sourceName) {
  const member = type.members?.find((candidate) => candidate.name === sourceName);
  assert.ok(member, `Missing source member ${type.name}.${sourceName}`);
  return member;
}

export function rawConstructor(type, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "constructor" &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing constructor ${type.sourceName} with signature ${signatureShape}`);
  return member;
}

export function rawIndexer(type, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "indexer" &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing indexer ${type.sourceName} with signature ${signatureShape}`);
  return member;
}

export function idHasShape(id, metadataShape) {
  return stripAssemblyQualifiers(id) === metadataShape;
}

export function stripAssemblyQualifiers(id) {
  return id.replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
    `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function buildConstraintFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constraints/ConstraintProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConstraintProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/constraints"),
  });
}

export function buildSignatureIdentityFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/signature-identity/SignatureIdentityProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "SignatureIdentityProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/signature-identity"),
  });
}

export function buildUnsupportedMemberFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/unsupported-members/UnsupportedMembersProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedMembersProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/unsupported-members"),
  });
}

export function buildAttributeFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/attributes/AttributeProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "AttributeProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/attributes"),
  });
}

export function buildUnsupportedDefaultParameterFixture() {
  const fixtureDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-default-params");
  const project = join(fixtureDirectory, "UnsupportedDefaultParameterProviderFixture.csproj");
  const source = join(fixtureDirectory, "UnsupportedDefaultParameterSource.cs");
  const outputDirectory = join(fixtureDirectory, "bin");
  const intermediateDirectory = join(fixtureDirectory, "obj/");
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
`);
  writeFileSync(source, `using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace ProviderUnsupportedDefaultFixtures;

public sealed class UnsupportedDefaultParameterSource
{
    public void UnsupportedDateTimeDefault(
        [Optional, DateTimeConstant(638000000000000000L)] DateTime value)
    {
    }
}
`);
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedDefaultParameterProviderFixture.dll",
    projectDirectory: fixtureDirectory,
  });
}
