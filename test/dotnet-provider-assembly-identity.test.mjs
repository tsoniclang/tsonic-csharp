import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
} from "../dist/index.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test(".NET reflection provider does not first-win duplicate source names from different assemblies", () => {
  const { acmeDll, contosoDll } = buildAssemblyIdentityFixtures();
  const provider = createDotnetReflectionTypeDataProvider({ references: [acmeDll, contosoDll] });
  const module = provider.getModule("@tsonic/dotnet/Shared.js", {});
  assert.equal("exports" in module, true, JSON.stringify(module));

  const widgetExports = module.exports.filter(isSharedWidgetDeclaration);
  assert.notEqual(
    widgetExports.length,
    1,
    "Shared.Widget from Acme.Contracts and Contoso.Contracts must not collapse into one normal source export.",
  );
  assert.equal(
    provider.findTargetBindingByTargetId("Shared.Widget"),
    undefined,
    "Metadata-name-only target id Shared.Widget must not resolve by first-wins behavior across assemblies.",
  );

  if (widgetExports.length === 0) {
    const unsupportedWidget = module.unsupportedExports?.find((declaration) => declaration.sourceName === "Widget");
    assert.ok(unsupportedWidget, "Duplicate Shared.Widget exports must leave explicit unsupported export evidence.");
    assertAssemblyCollisionEvidence(unsupportedWidget);
    return;
  }

  assert.equal(widgetExports.length, 2, "Distinct assembly-qualified handling must expose exactly both Widget identities.");
  assertDistinctAssemblyQualifiedIdentities(widgetExports);
});

function isSharedWidgetDeclaration(declaration) {
  return declaration.kind === "type" &&
    declaration.sourceName === "Widget" &&
    declaration.namespaceName === "Shared";
}

function assertAssemblyCollisionEvidence(declaration) {
  assert.match(declaration.kind, /^unsupported-/u);
  assert.equal(declaration.sourceName, "Widget");
  assertAssemblyQualifiedIds(readStringArray(declaration, "targetIds"));
  assert.deepEqual(assemblyNamesFromReferences(declaration.assemblies), ["Acme.Contracts", "Contoso.Contracts"]);
  assert.equal(JSON.stringify(declaration).includes("Shared.Widget"), true);
}

function assertDistinctAssemblyQualifiedIdentities(declarations) {
  assertAssemblyQualifiedIds(declarations.map(assemblyQualifiedIdOf));
}

function assemblyQualifiedIdOf(declaration) {
  if (typeof declaration.targetId === "string") {
    return declaration.targetId;
  }
  assert.fail(`Widget declaration lacks an assembly-qualified target identity: ${JSON.stringify(declaration)}`);
}

function assertAssemblyQualifiedIds(targetIds) {
  assert.equal(targetIds.length, 2);
  assert.equal(new Set(targetIds).size, 2);
  for (const targetId of targetIds) {
    assert.notEqual(targetId, "Shared.Widget");
    assert.match(targetId, /::Shared\.Widget$/u);
  }
  assert.deepEqual(assemblyNamesFromTargetIds(targetIds), ["Acme.Contracts", "Contoso.Contracts"]);
}

function assemblyNamesFromTargetIds(targetIds) {
  return [...new Set(targetIds.map((targetId) => {
    const separator = targetId.indexOf("::");
    assert.notEqual(separator, -1, `Expected assembly-qualified target id: ${targetId}`);
    return targetId.slice(0, separator).split(",")[0];
  }))].sort();
}

function assemblyNamesFromReferences(references) {
  assert.ok(Array.isArray(references), "Expected assembly reference evidence.");
  return [...new Set(references.map((reference) => reference?.name))].sort();
}

function readStringArray(value, propertyName) {
  const raw = value[propertyName];
  assert.ok(Array.isArray(raw), `Expected ${propertyName} evidence.`);
  assert.equal(raw.every((entry) => typeof entry === "string"), true, `Expected ${propertyName} strings.`);
  return raw;
}

function buildAssemblyIdentityFixtures() {
  return {
    acmeDll: buildAssemblyIdentityFixture("Acme.Contracts", "acme"),
    contosoDll: buildAssemblyIdentityFixture("Contoso.Contracts", "contoso"),
  };
}

function buildAssemblyIdentityFixture(projectName, outputName) {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/assembly-identity", projectName, `${projectName}.csproj`);
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/assembly-identity", outputName);
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/assembly-identity", `${outputName}-obj/`);
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:BaseIntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, `${projectName}.dll`);
}
