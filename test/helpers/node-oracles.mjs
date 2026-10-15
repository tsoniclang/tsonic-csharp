import { nodeOraclePrograms, assertOracleOutput, runNodeOracle } from "../../../tsonic/test/fixtures/node-oracle/index.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../csharp-nodejs/dist/index.js";
import { compileCsharpSource } from "./direct-csharp-session.mjs";
import { executeCsharpConstruction } from "./native-construction.mjs";
import { testRepositoryRoots } from "../../../tsonic/test/scripts/workspace-layout.mjs";
import { join } from "node:path";

export { nodeOraclePrograms, runNodeOracle };

export async function runNativeNodeOracle(program) {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
    capabilities: program.family === "streams" ? [nodejsCapability()] : [], sourceText: program.source,
  });
  const executed = executeCsharpConstruction(compiled, `node-oracle-${program.id}`, false, false,
    program.family === "streams" ? [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")] : []);
  assertOracleOutput(program, "csharp", executed);
  return executed;
}
