#!/usr/bin/env node
import { resolve } from "node:path";
import { buildDotnetFixture } from "../../test/helpers/dotnet-fixtures.mjs";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);

const fixtures = [
  fixture("attributes/AttributeProviderFixture.csproj", "attributes/bin", "attributes/obj/", "AttributeProviderFixture.dll", "attributes"),
  fixture("constructors/ConstructorProviderFixture.csproj", "constructors/bin", "constructors/obj/", "ConstructorProviderFixture.dll", "constructors"),
  fixture("unsupported-event/UnsupportedEventProviderFixture.csproj", "unsupported-event/bin", "unsupported-event/obj/", "UnsupportedEventProviderFixture.dll", "unsupported-event"),
  fixture("unsupported-members/UnsupportedMembersProviderFixture.csproj", "unsupported-members/bin", "unsupported-members/obj/", "UnsupportedMembersProviderFixture.dll", "unsupported-members"),
  fixture("constraints/ConstraintProviderFixture.csproj", "constraints/bin", "constraints/obj/", "ConstraintProviderFixture.dll", "constraints"),
  fixture("conversions/ConversionProviderFixture.csproj", "conversions/bin", "conversions/obj/", "ConversionProviderFixture.dll", "conversions"),
  fixture("signature-identity/SignatureIdentityProviderFixture.csproj", "signature-identity/bin", "signature-identity/obj/", "SignatureIdentityProviderFixture.dll", "signature-identity"),
  fixture("default-params/DefaultParameterProviderFixture.csproj", "default-params/bin", "default-params/obj/", "DefaultParameterProviderFixture.dll", "default-params"),
  fixture("recursive-delegates/RecursiveDelegateProviderFixture.csproj", "recursive-delegates", "recursive-delegates-obj/", "RecursiveDelegateProviderFixture.dll", "recursive-delegates"),
  fixture("assembly-identity/Acme.Contracts/Acme.Contracts.csproj", "assembly-identity/acme", "assembly-identity/acme-obj/", "Acme.Contracts.dll", "assembly-identity/Acme.Contracts"),
  fixture("assembly-identity/Contoso.Contracts/Contoso.Contracts.csproj", "assembly-identity/contoso", "assembly-identity/contoso-obj/", "Contoso.Contracts.dll", "assembly-identity/Contoso.Contracts"),
  fixture("missing-reference-dependency/MissingReference.Consumer/MissingReference.Consumer.csproj", "missing-reference-dependency/source", "missing-reference-dependency/obj/", "MissingReference.Consumer.dll", "missing-reference-dependency"),
];

for (const item of fixtures) {
  const output = buildDotnetFixture(item);
  console.log(`provider-fixture: ${output}`);
}

function fixture(projectRelativePath, outputRelativePath, intermediateRelativePath, outputAssemblyName, projectDirectoryRelativePath) {
  return {
    project: resolve(repoRoot, "test/fixtures/dotnet-provider", projectRelativePath),
    outputDirectory: resolve(repoRoot, ".temp/dotnet-provider-fixtures", outputRelativePath),
    intermediateDirectory: resolve(repoRoot, ".temp/dotnet-provider-fixtures", intermediateRelativePath),
    outputAssemblyName,
    projectDirectory: resolve(repoRoot, "test/fixtures/dotnet-provider", projectDirectoryRelativePath),
  };
}
