import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { compileCsharpSource } from "../helpers/direct-csharp-session.mjs";
import { dotnetDependencyArtifactsDirectory } from "../helpers/dotnet-execution.mjs";
import { executeCsharpConstruction } from "../helpers/native-construction.mjs";
import { nativeRuntimeLayout, nativeRuntimeReferences } from "../helpers/dotnet-runtime.mjs";

const compiled = compileCsharpSource({ targetOptions: { outputType: "Library" },
  sourceText: "export function run(): boolean { return true; }" });
const nodeProject = fileURLToPath(new URL(
  "../../../csharp-nodejs/csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj", import.meta.url,
));
assert.equal(nativeRuntimeReferences([nodeProject]).sharedRestore, false,
  "Node construction retains its real per-proof native restore graph");
const artifactRoot = dotnetDependencyArtifactsDirectory();
const runtime = JSON.parse(readFileSync(nativeRuntimeLayout().manifest, "utf8"));
const assemblies = ["Tsonic.CSharp.Runtime", "Tsonic.CSharp.Js", "Tsonic.CSharp.Node"];
const before = new Map(assemblies.map(assembly => {
  const path = runtime.assemblies[assembly];
  return [assembly, { path, bytes: readFileSync(path), identity: statSync(path, { bigint: true }) }];
}));
const output = executeCsharpConstruction(compiled, workerData.name, false, false, [nodeProject], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("parallel construction failed");
System.Console.WriteLine(System.AppContext.BaseDirectory);
`);
const fixtureRoot = resolve(output.trim(), "../../..");
assert.equal(dotnetDependencyArtifactsDirectory(), artifactRoot,
  "successful construction retains its mutable dependency owner");
for (const assembly of assemblies) {
  const original = before.get(assembly);
  const outputPath = original.path;
  const restorePath = resolve(artifactRoot, "obj", assembly, "net10.0", "project.assets.json");
  assert.equal(existsSync(outputPath), true, `checkout-owned output for ${assembly}`);
  assert.equal(existsSync(restorePath), true, `execution-owner-local restore for ${assembly}`);
  const current = statSync(outputPath, { bigint: true });
  assert.equal(current.dev, original.identity.dev, `${assembly} native input device unchanged`);
  assert.equal(current.ino, original.identity.ino, `${assembly} native input inode unchanged`);
  assert.equal(current.size, original.identity.size, `${assembly} native input size unchanged`);
  assert.equal(current.mtimeNs, original.identity.mtimeNs, `${assembly} native input not rewritten`);
  assert.equal(readFileSync(outputPath).equals(original.bytes), true, `${assembly} native input bytes unchanged`);
  const privateOutput = resolve(output.trim(), `${assembly}.dll`);
  assert.equal(existsSync(privateOutput), true, `${assembly} executable-local native reference exists`);
  assert.equal(readFileSync(privateOutput).equals(original.bytes), true,
    `${assembly} executable-local reference retains its exact native input bytes`);
}
parentPort.postMessage({ fixtureRoot, artifactRoot });
