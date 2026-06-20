import { test } from "node:test";
import assert from "node:assert/strict";
import { projectArtifact } from "../dist/backend/planner/project-artifacts.js";

test("project artifact emits explicit target-owned .NET references", () => {
  const artifact = projectArtifact(fakeInput({
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
  }), []);

  assert.equal(artifact.path, "TsonicGenerated.csproj");
  assert.match(artifact.text, /<ProjectReference Include="\.\.\/csharp-runtime\/src\/Tsonic\.CSharp\.Runtime\/Tsonic\.CSharp\.Runtime\.csproj" \/>/);
  assert.match(artifact.text, /<PackageReference Include="Tsonic\.CSharp\.Runtime" Version="0\.0\.1" PrivateAssets="all" IncludeAssets="runtime; build; native; contentfiles; analyzers" \/>/);
  assert.match(artifact.text, /<FrameworkReference Include="Microsoft\.AspNetCore\.App" \/>/);
  assert.match(artifact.text, /<Reference Include="Example\.Assembly" HintPath="\.\.\/lib\/Example\.Assembly\.dll" \/>/);
});

test("project artifact escapes explicit reference values", () => {
  const artifact = projectArtifact(fakeInput({
    references: {
      packages: [{ include: "Example&Package", version: "1.0.0<beta>" }],
    },
  }), []);

  assert.match(artifact.text, /Include="Example&amp;Package"/);
  assert.match(artifact.text, /Version="1\.0\.0&lt;beta&gt;"/);
});

test("project artifact rejects unsupported reference keys", () => {
  assert.throws(() => projectArtifact(fakeInput({
    references: {
      runtime: ["Tsonic.CSharp.Runtime"],
    },
  }), []), /references\.runtime/);
});

test("project artifact rejects duplicate references", () => {
  assert.throws(() => projectArtifact(fakeInput({
    references: {
      projects: ["../runtime.csproj", "../runtime.csproj"],
    },
  }), []), /duplicate project reference/);
});

function fakeInput(options = {}) {
  return {
    target: { id: "csharp", options },
  };
}
