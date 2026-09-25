import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { formatDiagnostics } from "@tsonic/tsts";

import {
  createDotnetModuleSpecifierPolicy,
  csharpDotnetProviderContributionKind,
} from "../../../../dist/public/provider-dotnet.js";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { buildDotnetFixture } from "../../../helpers/dotnet-fixtures.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test("C# target composes capability-owned .NET source providers", () => {
  const packageName = "@acme/contracts";
  const outputDirectory = join(
    repoRoot,
    ".temp/dotnet-provider-fixtures/capability-source-provider",
  );
  const projectDirectory = join(
    repoRoot,
    "test/fixtures/dotnet-provider/capability-source-provider",
  );
  buildDotnetFixture({
    project: join(projectDirectory, "CapabilitySourceProvider.csproj"),
    projectDirectory,
    outputDirectory,
    intermediateDirectory: join(outputDirectory, "obj/"),
    outputAssemblyName: "Acme.CapabilityContracts.dll",
  });
  const moduleSpecifierPolicy = createDotnetModuleSpecifierPolicy(packageName);
  const capability = {
    kind: "target-capability",
    id: packageName,
    targetId: "csharp",
    displayName: "Fixture contracts",
    moduleOwnership: [{ specifierPrefix: moduleSpecifierPolicy.modulePrefix }],
    createTargetContributions() {
      return [{
        kind: csharpDotnetProviderContributionKind,
        providerIdentity: {
          id: "acme.contracts.provider",
          version: "1.0.0",
          target: "csharp",
          displayName: "Fixture contracts provider",
        },
        moduleSpecifierPolicy,
        referenceDirectoryUrl: pathToFileURL(`${outputDirectory}/`).href,
        assemblySourcePackages: [{
          assemblyName: "Acme.CapabilityContracts",
          packageName,
        }],
        targetFramework: "net10.0",
      }];
    },
  };

  const compiled = compileCsharpSource({
    capabilities: [capability],
    surface: "js",
    sourceText: [
      `import { NarrowVisitor, ProviderBase, ProviderStore, Widget } from "${packageName}/Shared.js";`,
      "import { JsonSerializer } from \"@tsonic/dotnet/System.Text.Json.js\";",
      "export function count(value: Widget) {",
      "  return value.Count();",
      "}",
      "export type Visitor = NarrowVisitor;",
      "export class Input extends ProviderBase {",
      "  title = \"\";",
      "}",
      "export function parse(json: string): Input | undefined {",
      "  return JsonSerializer.Deserialize<Input>(json);",
      "}",
      "export function read(store: ProviderStore): string | undefined {",
      "  const value = store.Find();",
      "  if (value !== undefined) {",
      "    return value.Name;",
      "  }",
      "  return undefined;",
      "}",
      "export function hasName(store: ProviderStore, name: string): boolean {",
      "  return store.Names().includes(name);",
      "}",
      "export function firstName(store: ProviderStore, name: string): number {",
      "  return store.Names().indexOf(name);",
      "}",
      "export function lastName(store: ProviderStore, name: string): number {",
      "  return store.Names().lastIndexOf(name);",
      "}",
      "export function joinedNames(store: ProviderStore): string {",
      "  return store.Names().join(\"|\");",
      "}",
      "export function remainingNames(store: ProviderStore): string[] {",
      "  return store.Names().slice(1);",
      "}",
      "",
    ].join("\n"),
  });

  assert.equal(
    formatDiagnostics(compiled.source.diagnostics),
    "",
    JSON.stringify(compiled.extensionDiagnostics, null, 2),
  );
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /JsonSerializer\.Deserialize<Input>\(json\)/,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /Tsonic\.CSharp\.Js\.Array\.includes\(store\.Names\(\), name\)/,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /Tsonic\.CSharp\.Js\.Array\.indexOf\(store\.Names\(\), name\)/,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /Tsonic\.CSharp\.Js\.Array\.lastIndexOf\(store\.Names\(\), name\)/,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /Tsonic\.CSharp\.Js\.Array\.join\(store\.Names\(\), "\|"\)/,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /Tsonic\.CSharp\.Js\.Array\.slice\(store\.Names\(\), 1\)/,
  );
});
