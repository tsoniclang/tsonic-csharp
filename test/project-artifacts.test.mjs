import { test } from "node:test";
import assert from "node:assert/strict";
import { planCsharpProjectFile } from "../dist/backend/planner/project-artifacts.js";
import { createCsharpTargetPack } from "../dist/descriptor/csharp-target-pack.js";
import { printCsharpProjectFile } from "../dist/print/csharp-project-printer.js";
import { createDotnetToolchain } from "../dist/toolchain/dotnet-toolchain.js";

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

test("target provider contributes closed compat carrier runtime without requiring the JS surface", () => {
  const targetPack = createCsharpTargetPack();
  const provider = targetPack.provider;
  const jsSurface = targetPack.surfaces.find((surface) => surface.id === "js");

  assert.ok(provider);
  assert.ok(jsSurface);

  const strictReferences = provider.runtimeContributions(fakeRuntimeContributionContext({ target: { id: "csharp", options: {} } })).references;
  const compatReferences = provider.runtimeContributions(fakeRuntimeContributionContext({
    target: { id: "csharp", options: { typescriptCompatibility: "compat" } },
  })).references;
  const compatWithJsSurfaceReferences = provider.runtimeContributions(fakeRuntimeContributionContext({
    target: { id: "csharp", options: { typescriptCompatibility: "compat" } },
    selectedSurfaces: [jsSurface],
  })).references;

  assert.equal(strictReferences.filter((reference) => reference.kind === "assembly" && reference.include === "Tsonic.CSharp.Js").length, 0);
  assert.equal(compatReferences.filter((reference) => reference.kind === "assembly" && reference.include === "Tsonic.CSharp.Js").length, 1);
  assert.equal(compatWithJsSurfaceReferences.filter((reference) => reference.kind === "assembly" && reference.include === "Tsonic.CSharp.Js").length, 0);
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
  };
}

function fakeRuntimeContributionContext(options = {}) {
  return {
    project: { targets: [] },
    target: options.target ?? { id: "csharp", options: {} },
    selectedPackages: options.selectedPackages ?? [],
    selectedSurfaces: options.selectedSurfaces ?? [],
    paths: {
      projectFilePath: "tsonic.json",
      projectRoot: ".",
      outputRoot: "out",
      targetOutputRoot: "out/csharp",
    },
  };
}
