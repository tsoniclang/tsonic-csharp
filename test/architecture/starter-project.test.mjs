import assert from "node:assert/strict";
import test from "node:test";
import { createTsonicPlugin } from "../../dist/index.js";

test("C# target owns one complete immutable starter descriptor", () => {
  const plugin = createTsonicPlugin();
  const starter = plugin.createStarterProject({ projectName: "hello-csharp" });
  assert.deepEqual(starter.target, {
    id: "csharp",
    options: {
      assemblyName: "HelloCsharp",
      namespace: "HelloCsharp.Generated",
      outputType: "Exe",
    },
  });
  assert.equal(starter.scripts.build, "tsonic build --project tsonic.json");
  assert.equal(starter.scripts.start, "npm run build && dotnet run --project out/csharp/HelloCsharp.csproj");
  assert.equal(starter.scripts.check, "npm run build && dotnet build out/csharp/HelloCsharp.csproj --nologo");
  assert.deepEqual(starter.files, [{
    path: "src/App.ts",
    contents: 'import { Console } from "@tsonic/dotnet/System.js";\n\nConsole.WriteLine("Hello from hello-csharp!");\n',
  }]);
  assert.deepEqual(starter.requirements, [{
    id: "dotnet-sdk-10",
    displayName: ".NET 10 SDK",
    checks: [{
      command: "dotnet",
      args: ["--list-sdks"],
      expectedOutputPattern: "^10\\.0\\.[0-9]+",
    }],
    installUrl: "https://dotnet.microsoft.com/en-us/download/dotnet/10.0",
    installInstructions: "Install the .NET 10 SDK, not only the runtime.",
  }]);
  assert.equal(Object.isFrozen(starter), true);
});
