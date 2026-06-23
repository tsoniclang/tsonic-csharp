import { test } from "node:test";
import assert from "node:assert/strict";
import { planCsharpProjectFile } from "../dist/backend/planner/project-artifacts.js";
import { printCsharpProjectFile } from "../dist/print/csharp-project-printer.js";

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

test("project artifact emits NativeAOT as an explicit target project property", () => {
  const text = printCsharpProjectFile(planCsharpProjectFile(fakeInput({
    publishAot: true,
    outputType: "Exe",
  })));

  assert.match(text, /<OutputType>Exe<\/OutputType>/);
  assert.match(text, /<PublishAot>true<\/PublishAot>/);
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

function fakeInput(options = {}) {
  return {
    target: { id: "csharp", options },
    runtimeReferences: [],
  };
}
