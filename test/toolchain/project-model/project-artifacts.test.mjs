import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planCsharpProject, planCsharpProjectFile } from "../../../dist/backend/planner/project/project-artifacts.js";
import { materializeCsharpOutputPlan } from "../../../dist/backend/emission/materialize.js";
import { createCsharpTargetPack } from "../../../dist/descriptor/csharp-target-pack.js";
import { printCsharpProjectFile } from "../../../dist/print/project/csharp-project.js";
import { createDotnetToolchain } from "../../../dist/toolchain/dotnet-toolchain.js";
import { validateCsharpTargetOptions } from "../../../dist/options/csharp-target-options.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tsonicLangRoot = dirname(repoRoot);
const fixtureProjectRoot = join(repoRoot, ".temp", "project-artifacts-installed-runtime");

test("project artifact emits explicit target-owned .NET references", () => {
  const project = planCsharpProjectFile(fakeInput({
    references: {
      projects: ["../csharp-runtime/src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj"],
      packages: [
        {
          include: "Tsonic.CSharp.Runtime",
          version: "0.0.1",
          privateAssets: "all",
          includeAssets: "runtime; build; native; contentfiles; analyzers",
        },
      ],
      frameworks: ["Microsoft.AspNetCore.App"],
      assemblies: [
        {
          include: "Example.Assembly",
          hintPath: "../lib/Example.Assembly.dll",
        },
      ],
    },
  }));
  const text = printCsharpProjectFile(project);

  assert.equal(project.path, "TsonicGenerated.csproj");
  assert.match(text, /<ProjectReference Include="\.\.\/csharp-runtime\/src\/Tsonic\.CSharp\.Runtime\/Tsonic\.CSharp\.Runtime\.csproj" \/>/);
  assert.match(text, /<PackageReference Include="Tsonic\.CSharp\.Runtime" Version="0\.0\.1" PrivateAssets="all" IncludeAssets="runtime; build; native; contentfiles; analyzers" \/>/);
  assert.match(text, /<FrameworkReference Include="Microsoft\.AspNetCore\.App" \/>/);
  assert.match(text, /<Reference Include="Example\.Assembly" HintPath="\.\.\/lib\/Example\.Assembly\.dll" \/>/);
});

test("project artifact emits library output deterministically by default", () => {
  const text = printCsharpProjectFile(planCsharpProjectFile(fakeInput()));

  assert.match(text, /<OutputType>Library<\/OutputType>/);
  assert.doesNotMatch(text, /<ItemGroup>/);
  assert.doesNotMatch(text, /<PublishAot>/);
});

test("user-owned project mode plans source-only output and never emits a generated project artifact", () => {
  const userProjectFile = ensureUserProjectFile("UserOwned.csproj");
  const diagnostics = [];
  const project = planCsharpProject(fakeInput({
    projectFile: "UserOwned.csproj",
    outputType: "Exe",
    references: {
      frameworks: ["Microsoft.AspNetCore.App"],
    },
  }), {}, diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(project, {
    kind: "user-owned",
    projectFile: userProjectFile,
  });

  const artifacts = materializeCsharpOutputPlan({
    project,
    sources: [{
      path: "src/Index.cs",
      unit: { kind: "CompilationUnit", usings: [], members: [] },
    }],
  });
  assert.deepEqual(artifacts.map((artifact) => artifact.kind), ["source"]);
  assert.equal(artifacts[0].path, "src/Index.cs");
});

test("user-owned project mode reports deterministic diagnostics for invalid project files", () => {
  const notCsharpProject = ensureUserProjectFile("NotCsharpProject.txt");
  const generatedProject = ensureUserProjectFile("out/csharp/Generated.csproj");
  const directoryProjectPath = join(fixtureProjectRoot, "DirectoryProject.csproj");
  mkdirSync(directoryProjectPath, { recursive: true });

  assertUserProjectDiagnostic({ projectFile: "Missing.csproj" }, /does not exist/u);
  assertUserProjectDiagnostic({ projectFile: notCsharpProject }, /must point to a \.csproj file/u);
  assertUserProjectDiagnostic({ projectFile: directoryProjectPath }, /must point to a file/u);
  assertUserProjectDiagnostic({ projectFile: generatedProject }, /must not point inside generated target output root/u);
});

test("project artifact emits executable output only from explicit C# target option", () => {
  const text = printCsharpProjectFile(planCsharpProjectFile(fakeInput({
    outputType: "Exe",
  })));

  assert.match(text, /<OutputType>Exe<\/OutputType>/);
});

test("project artifact emits NativeAOT only as an explicit C# target project property", () => {
  const text = printCsharpProjectFile(planCsharpProjectFile(fakeInput({
    publishAot: true,
    outputType: "Exe",
  })));

  assert.match(text, /<OutputType>Exe<\/OutputType>/);
  assert.match(text, /<PublishAot>true<\/PublishAot>/);
});

test("project artifact keeps language syntax and memory-safety rules independent", () => {
  const syntaxOnly = printCsharpProjectFile(planCsharpProjectFile(fakeInput({
    languageDialect: "csharp15-preview",
  })));
  const updatedRules = printCsharpProjectFile(planCsharpProjectFile(fakeInput({
    languageDialect: "csharp15-preview",
    memorySafetyRules: "preview",
  })));

  assert.match(syntaxOnly, /<LangVersion>preview<\/LangVersion>/);
  assert.doesNotMatch(syntaxOnly, /<Features>/);
  assert.match(updatedRules, /<LangVersion>preview<\/LangVersion>/);
  assert.match(
    updatedRules,
    /<Features>updated-memory-safety-rules<\/Features>/,
  );
  assert.throws(() => planCsharpProjectFile(fakeInput({
    memorySafetyRules: "preview",
  })), /requires languageDialect='csharp15-preview'/u);
  assert.throws(() => planCsharpProjectFile(fakeInput({
    languageDialect: "csharp15-preview",
    memorySafetyRules: "latest",
  })), /memorySafetyRules/u);
});

test("C# target options reject retired compatibility controls", () => {
  assert.throws(
    () => validateCsharpTargetOptions({
      id: "csharp",
      options: { typescriptCompatibility: "compat" },
    }),
    /option 'options\.typescriptCompatibility' is not supported/u,
  );
  assert.throws(
    () => validateCsharpTargetOptions({
      id: "csharp",
      options: { memorySafetyRules: "legacy" },
    }),
    /must be either 'csharp14' or 'preview'/u,
  );
});

test("project artifact rejects invalid executable/library output shapes", () => {
  assert.throws(() => planCsharpProjectFile(fakeInput({
    outputType: "WinExe",
  })), /outputType/);
  assert.throws(() => planCsharpProjectFile(fakeInput({
    outputType: true,
  })), /outputType/);
});

test("project artifact rejects invalid NativeAOT option shapes", () => {
  assert.throws(() => planCsharpProjectFile(fakeInput({
    publishAot: "true",
  })), /publishAot/);
});

test("project artifact rejects unknown C# target options instead of ignoring them", () => {
  assert.throws(() => planCsharpProjectFile(fakeInput({
    rootNamespace: "Legacy.Generated",
  })), /options\.rootNamespace/);
});

test("project artifact escapes explicit reference values", () => {
  const text = printCsharpProjectFile(planCsharpProjectFile(fakeInput({
    references: {
      packages: [{ include: "Example&Package", version: "1.0.0<beta>" }],
    },
  })));

  assert.match(text, /Include="Example&amp;Package"/);
  assert.match(text, /Version="1\.0\.0&lt;beta&gt;"/);
});

test("project artifact rejects unsupported custom project property shapes", () => {
  assert.throws(() => planCsharpProjectFile(fakeInput({
    properties: ["PublishTrimmed"],
  })), /properties/);
  assert.throws(() => planCsharpProjectFile(fakeInput({
    properties: {
      "Bad Property": true,
    },
  })), /Bad Property/);
  assert.throws(() => planCsharpProjectFile(fakeInput({
    properties: {
      DefineConstants: ["AOT"],
    },
  })), /DefineConstants/);
  assert.throws(() => planCsharpProjectFile(fakeInput({
    properties: {
      PublishAot: true,
    },
  })), /target-owned/);
  assert.throws(() => planCsharpProjectFile(fakeInput({
    properties: {
      Features: "updated-memory-safety-rules",
    },
  })), /target-owned/);
});

test("project artifact rejects unsupported reference keys", () => {
  assert.throws(() => planCsharpProjectFile(fakeInput({
    references: {
      runtime: ["Tsonic.CSharp.Runtime"],
    },
  })), /references\.runtime/);
});

test("project artifact rejects duplicate references", () => {
  assert.throws(() => planCsharpProjectFile(fakeInput({
    references: {
      projects: ["../runtime.csproj", "../runtime.csproj"],
    },
  })), /duplicate project reference/);
});

test("project artifact includes runtime references only from selected target or surface contributions", () => {
  const withoutRuntimeReferences = printCsharpProjectFile(planCsharpProjectFile(fakeInput()));
  const withRuntimeReferences = printCsharpProjectFile(planCsharpProjectFile(fakeInput({}, [
    { kind: "project", include: "../csharp-js/src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj" },
    {
      kind: "package",
      include: "Tsonic.CSharp.Runtime",
      version: "0.0.1",
      attributes: { PrivateAssets: "all" },
    },
    { kind: "framework", include: "Microsoft.AspNetCore.App" },
    { kind: "assembly", include: "Example.Assembly", attributes: { HintPath: "../lib/Example.Assembly.dll" } },
  ])));

  assert.doesNotMatch(withoutRuntimeReferences, /Tsonic\.CSharp\.Js/);
  assert.match(withRuntimeReferences, /<ProjectReference Include="\.\.\/csharp-js\/src\/Tsonic\.CSharp\.Js\/Tsonic\.CSharp\.Js\.csproj" \/>/);
  assert.match(withRuntimeReferences, /<PackageReference Include="Tsonic\.CSharp\.Runtime" Version="0\.0\.1" PrivateAssets="all" \/>/);
  assert.match(withRuntimeReferences, /<FrameworkReference Include="Microsoft\.AspNetCore\.App" \/>/);
  assert.match(withRuntimeReferences, /<Reference Include="Example\.Assembly" HintPath="\.\.\/lib\/Example\.Assembly\.dll" \/>/);
});

test("target provider contributes one canonical JS-value runtime independently of JS surface declarations", () => {
  const targetPack = createCsharpTargetPack();
  const provider = targetPack.provider;
  const jsSurface = targetPack.surfaces.find((surface) => surface.id === "js");

  assert.ok(provider);
  assert.ok(jsSurface);

  const references = provider.runtimeContributions(fakeRuntimeContributionContext({
    target: { id: "csharp", options: {} },
  })).references;
  const referencesWithJsSurface = provider.runtimeContributions(fakeRuntimeContributionContext({
    target: { id: "csharp", options: {} },
    selectedSurfaces: [jsSurface],
  })).references;

  assert.equal(references.filter((reference) => reference.kind === "assembly" && reference.include === "Tsonic.CSharp.Js").length, 1);
  assert.equal(referencesWithJsSurface.filter((reference) => reference.kind === "assembly" && reference.include === "Tsonic.CSharp.Js").length, 1);
  assert.deepEqual(
    jsSurface.runtimeContributions(fakeRuntimeContributionContext({
      target: { id: "csharp", options: {} },
      selectedSurfaces: [jsSurface],
    })),
    {},
  );
});

test("dotnet toolchain reports deterministic source-to-source artifacts without publishing", () => {
  const toolchain = createDotnetToolchain({});
  const result = toolchain.prepare({
    artifactsRoot: "out",
    project: { targets: [] },
    target: { id: "csharp", options: { publishAot: true, outputType: "Exe" } },
    compileResult: {
      diagnostics: [],
      artifacts: [
        { kind: "project", path: "App.csproj", text: "<Project />" },
        { kind: "source", path: "Program.cs", language: "csharp", text: "namespace App {}" },
      ],
    },
  });

  assert.deepEqual(result, {
    diagnostics: [],
    producedArtifacts: ["App.csproj", "Program.cs"],
  });
});

function fakeInput(options = {}, runtimeReferences = []) {
  return {
    target: { id: "csharp", options },
    runtimeReferences,
    paths: {
      projectFilePath: join(fixtureProjectRoot, "tsonic.json"),
      projectRoot: fixtureProjectRoot,
      outputRoot: join(fixtureProjectRoot, "out"),
      targetOutputRoot: join(fixtureProjectRoot, "out/csharp"),
    },
  };
}

function ensureUserProjectFile(relativePath) {
  const projectFile = resolve(fixtureProjectRoot, relativePath);
  mkdirSync(dirname(projectFile), { recursive: true });
  writeFileSync(projectFile, "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
  return projectFile;
}

function assertUserProjectDiagnostic(options, messagePattern) {
  const diagnostics = [];
  const project = planCsharpProject(fakeInput(options), {}, diagnostics);

  assert.equal(project, undefined);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_USER_PROJECT_INVALID");
  assert.match(diagnostics[0].message, messagePattern);
  assert.deepEqual(diagnostics[0].category, "error");
}

function fakeRuntimeContributionContext(options = {}) {
  ensureInstalledRuntimeFixtureProject();
  return {
    project: { targets: [] },
    target: options.target ?? { id: "csharp", options: {} },
    selectedPackages: options.selectedPackages ?? [],
    selectedSurfaces: options.selectedSurfaces ?? [],
    paths: {
      projectFilePath: "tsonic.json",
      projectRoot: fixtureProjectRoot,
      outputRoot: "out",
      targetOutputRoot: "out/csharp",
    },
  };
}

function ensureInstalledRuntimeFixtureProject() {
  mkdirSync(join(fixtureProjectRoot, "node_modules", "@tsonic"), { recursive: true });
  linkInstalledRuntimePackage("@tsonic/csharp-runtime", join(tsonicLangRoot, "csharp-runtime"));
  linkInstalledRuntimePackage("@tsonic/csharp-js", join(tsonicLangRoot, "csharp-js"));
}

function linkInstalledRuntimePackage(packageName, packageRoot) {
  const linkPath = join(fixtureProjectRoot, "node_modules", ...packageName.split("/"));
  try {
    symlinkSync(packageRoot, linkPath, "dir");
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}
