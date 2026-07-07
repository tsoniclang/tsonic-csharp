import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  augmentDotnetModuleWithNativeArray,
  createDotnetProviderTelemetry,
  createDotnetReflectionTypeDataProvider,
  createDotnetTargetBindingProvider,
  dotnetNativeArrayCreateMemberId,
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
  dotnetModuleToProviderDeclarationModel,
  dotnetTypeRefToProviderType,
  dotnetTypeRefToTargetTypeRef,
  validateDotnetProviderDeclarationModelContract,
} from "../dist/index.js";
import {
  dotnetExportToTargetBinding,
  tryDotnetTypeRefToProviderType,
} from "../dist/providers/dotnet/model.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";
export { assert, dirname, join, test, fileURLToPath, augmentDotnetModuleWithNativeArray, createDotnetProviderTelemetry, createDotnetReflectionTypeDataProvider, createDotnetTargetBindingProvider, dotnetNativeArrayCreateMemberId, dotnetNativeArrayIndexerMemberId, dotnetNativeArrayLengthMemberId, dotnetNativeArrayTypeId, dotnetModuleToProviderDeclarationModel, dotnetTypeRefToProviderType, dotnetTypeRefToTargetTypeRef, validateDotnetProviderDeclarationModelContract, dotnetExportToTargetBinding, tryDotnetTypeRefToProviderType, buildDotnetFixture };

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const testAssemblyId = "Test.Assembly, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null";

export function testTargetId(metadataName) {
  return `${testAssemblyId}::${metadataName}`;
}

export function namedDotnetTypeRef(metadataName, options = {}) {
  return {
    kind: "named",
    targetId: testTargetId(metadataName),
    metadataName,
    displayName: metadataName,
    ...options,
  };
}

export function methodMember(ownerMetadataName, sourceName, targetName, parameters, returnType = { kind: "void" }) {
  const signatureMetadataName = `${ownerMetadataName}.${targetName}(${parameters.map(dotnetTestTypeMetadataName).join(",")})`;
  return {
    kind: "method",
    sourceName,
    targetName,
    targetId: testTargetId(`${ownerMetadataName}.${targetName}`),
    metadataName: `${ownerMetadataName}.${targetName}`,
    signatures: [
      {
        id: testTargetId(signatureMetadataName),
        targetName,
        parameters,
        returnType,
      },
    ],
  };
}

export function dotnetTestTypeMetadataName(parameter) {
  const type = "type" in parameter ? parameter.type : parameter;
  switch (type.kind) {
    case "string":
      return "System.String";
    case "source-primitive":
      return sourcePrimitiveTestMetadataName(type.name);
    case "type-parameter":
      return type.name;
    case "named":
      return type.metadataName;
    default:
      return type.kind;
  }
}

export function sourcePrimitiveTestMetadataName(name) {
  switch (name) {
    case "int32":
      return "System.Int32";
    case "bool":
      return "System.Boolean";
    case "float64":
      return "System.Double";
    default:
      return name;
  }
}

export function getDotnetDeclaration(provider, moduleSpecifier, metadataName) {
  const module = provider.getModule(moduleSpecifier, {});
  assert.equal("exports" in module, true, JSON.stringify(module));
  const declaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find((candidate) => candidate.kind === "type" && candidate.metadataName === metadataName);
  assert.ok(declaration, `Missing .NET declaration '${metadataName}' in ${moduleSpecifier}`);
  return declaration;
}

export function getDotnetTargetId(provider, moduleSpecifier, metadataName) {
  return getDotnetDeclaration(provider, moduleSpecifier, metadataName).targetId;
}

export function getDotnetBinding(provider, moduleSpecifier, metadataName) {
  const targetId = getDotnetTargetId(provider, moduleSpecifier, metadataName);
  const binding = provider.findTargetBindingByTargetId(targetId);
  assert.ok(binding, `Missing .NET target binding '${targetId}'`);
  return binding;
}

export function requireDotnetMember(declaration, kind, sourceName, targetName = sourceName) {
  const matches = declaration?.members?.filter((member) =>
    member.kind === kind &&
    member.sourceName === sourceName &&
    member.targetName === targetName
  ) ?? [];
  assert.equal(matches.length, 1, `Expected exactly one ${kind} member ${sourceName} -> ${targetName} on ${declaration?.sourceName ?? "<missing>"}`);
  return matches[0];
}

export function requireProviderDeclarationMember(declaration, kind, name) {
  const matches = declaration?.members?.filter((member) => member.kind === kind && member.name === name) ?? [];
  assert.equal(matches.length, 1, `Expected exactly one source ${kind} member ${name} on ${declaration?.name ?? "<missing>"}`);
  return matches[0];
}

export function idEndsWith(id, metadataSuffix) {
  return stripAssemblyQualifiers(id) === metadataSuffix;
}

export function findByIdSuffix(values, metadataSuffix) {
  return values.find((value) => typeof value.id === "string" && idEndsWith(value.id, metadataSuffix));
}

export function stripAssemblyQualifiers(id) {
  return id
    .replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
      `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`)
    .replace(/\+/gu, ".");
}

export function collectProviderRefs(value, predicate, refs = []) {
  if (value === null || typeof value !== "object") {
    return refs;
  }
  if (value.kind === "provider-ref" && predicate(value)) {
    refs.push(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectProviderRefs(item, predicate, refs);
    }
    return refs;
  }
  for (const nested of Object.values(value)) {
    collectProviderRefs(nested, predicate, refs);
  }
  return refs;
}

export function assertProviderDeclarationRefsFullyQualified(model) {
  const invalidRefs = collectProviderRefs(model, (providerRef) =>
    typeof providerRef.moduleSpecifier !== "string" ||
    providerRef.moduleSpecifier.length === 0 ||
    typeof providerRef.exportName !== "string" ||
    providerRef.exportName.length === 0 ||
    "name" in providerRef
  );
  assert.deepEqual(invalidRefs, []);
}







































































export function unsupportedMembersByMetadataName(declaration) {
  return new Map(declaration.unsupportedMembers?.map((member) => [member.metadataName, member]) ?? []);
}

export function constructorSignature(declaration, signatureId) {
  const signature = declaration.members
    ?.filter((member) => member.kind === "constructor")
    .flatMap((member) => member.signatures ?? [])
    .find((candidate) => idEndsWith(candidate.id, signatureId));
  assert.ok(signature, `constructor signature ${signatureId}`);
  return signature;
}

export function methodSignature(declaration, memberName, signatureId) {
  const member = declaration.members?.find((candidate) =>
    candidate.kind === "method" &&
    (candidate.targetName === memberName || candidate.name === memberName || candidate.sourceName === memberName) &&
    candidate.signatures?.some((signature) => idEndsWith(signature.id, signatureId))
  );
  assert.ok(member, `method ${memberName}`);
  const signature = member.signatures.find((candidate) => idEndsWith(candidate.id, signatureId));
  assert.ok(signature, `method signature ${signatureId}`);
  return signature;
}

export function parameterFacts(parameters) {
  return parameters.map((parameter) => ({
    name: parameter.name,
    type: typeFact(parameter.type),
    ...(parameter.passingMode !== undefined ? { passingMode: parameter.passingMode } : {}),
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.rest === true ? { rest: true } : {}),
    ...(parameter.paramsArray === true ? { paramsArray: true } : {}),
    ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
    ...(parameter.unsupportedDefaultValue !== undefined ? { unsupportedDefaultValue: parameter.unsupportedDefaultValue } : {}),
  }));
}

export function stripTargetPayload(value) {
  if (Array.isArray(value)) {
    return value.map(stripTargetPayload);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "targetBinding" && key !== "targetIdentity")
        .map(([key, nested]) => [key, stripTargetPayload(nested)]),
    );
  }
  return value;
}

export function typeFact(type) {
  switch (type.kind) {
    case "array":
      return {
        kind: "array",
        element: typeFact(type.element ?? type.elementType),
      };
    case "named":
      return {
        kind: "named",
        metadataName: type.metadataName,
      };
    case "source-primitive":
      return {
        kind: "source-primitive",
        name: type.name,
      };
    case "string":
      return { kind: "string" };
    case "target-named":
      return {
        kind: "target-named",
        id: stripAssemblyQualifiers(type.id),
      };
    default:
      return { kind: type.kind };
  }
}

export function omitLocalName(type) {
  if (type === undefined || type.localName === undefined) {
    return type;
  }
  const { localName: _localName, ...rest } = type;
  return rest;
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

export function buildConstructorFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constructors/ConstructorProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constructors/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constructors/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConstructorProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/constructors"),
  });
}

export function buildUnsupportedEventFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/unsupported-event/UnsupportedEventProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-event/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-event/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedEventProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/unsupported-event"),
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

export function buildConversionFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/conversions/ConversionProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/conversions/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/conversions/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConversionProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/conversions"),
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
