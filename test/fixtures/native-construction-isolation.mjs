import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { compileCsharpSource } from "../helpers/direct-csharp-session.mjs";
import { dotnetDependencyArtifactsDirectory } from "../helpers/dotnet-execution.mjs";
import { executeCsharpConstruction } from "../helpers/native-construction.mjs";

const compiled = compileCsharpSource({ targetOptions: { outputType: "Library" },
  sourceText: "export function run(): boolean { return true; }" });
const nodeProject = fileURLToPath(new URL(
  "../../../csharp-nodejs/csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj", import.meta.url,
));
const artifactRoot = dotnetDependencyArtifactsDirectory();
const output = executeCsharpConstruction(compiled, workerData.name, false, false, [nodeProject], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("parallel construction failed");
System.Console.WriteLine(System.AppContext.BaseDirectory);
`);
const fixtureRoot = resolve(output.trim(), "../../..");
assert.equal(dotnetDependencyArtifactsDirectory(), artifactRoot, "successful construction retains its dependency owner");
const assemblies = ["Tsonic.CSharp.Runtime", "Tsonic.CSharp.Js", "Tsonic.CSharp.Node"];
for (const assembly of assemblies) {
  const outputPath = resolve(artifactRoot, "bin", assembly, "Release", "net10.0", `${assembly}.dll`);
  const restorePath = resolve(artifactRoot, "obj", assembly, "net10.0", "project.assets.json");
  assert.equal(existsSync(outputPath), true, `execution-owner-local output for ${assembly}`);
  assert.equal(existsSync(restorePath), true, `execution-owner-local restore for ${assembly}`);
}
parentPort.postMessage({ fixtureRoot, artifactRoot });
