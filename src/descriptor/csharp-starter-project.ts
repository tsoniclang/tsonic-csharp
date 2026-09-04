import type {
  TargetStarterProject,
  TargetStarterProjectContext,
} from "@tsonic/target-api";
import { toPascalCase } from "../target-model/names/identifiers.js";
import { csharpTargetId } from "../target-model/identities/source.js";

export function createCsharpStarterProject(
  context: TargetStarterProjectContext,
): TargetStarterProject {
  const assemblyName = toPascalCase(context.projectName);
  return Object.freeze({
    target: Object.freeze({
      id: csharpTargetId,
      options: Object.freeze({
        assemblyName,
        namespace: `${assemblyName}.Generated`,
        outputType: "Exe",
      }),
    }),
    scripts: Object.freeze({
      build: "tsonic build --project tsonic.json",
      start: `npm run build && dotnet run --project out/csharp/${assemblyName}.csproj`,
      check: `npm run build && dotnet build out/csharp/${assemblyName}.csproj --nologo`,
    }),
    files: Object.freeze([
      Object.freeze({
        path: "src/App.ts",
        contents: [
          'import { Console } from "@tsonic/dotnet/System.js";',
          "",
          `Console.WriteLine(${JSON.stringify(`Hello from ${context.projectName}!`)});`,
          "",
        ].join("\n"),
      }),
    ]),
    requirements: Object.freeze([
      Object.freeze({
        id: "dotnet-sdk-10",
        displayName: ".NET 10 SDK",
        checks: Object.freeze([
          Object.freeze({
            command: "dotnet",
            args: Object.freeze(["--list-sdks"]),
            expectedOutputPattern: "^10\\.0\\.[0-9]+",
          }),
        ]),
        installUrl: "https://dotnet.microsoft.com/en-us/download/dotnet/10.0",
        installInstructions: "Install the .NET 10 SDK, not only the runtime.",
      }),
    ]),
  });
}
