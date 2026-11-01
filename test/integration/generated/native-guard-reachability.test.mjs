import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeGuardReachabilitySource, nativeHeaderReachabilitySource, nativeGuardGetterEffectsSource } from "../../../../tsonic/test/fixtures/native-guard-reachability.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { join } from "node:path";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";

for (const surface of [undefined, "js"]) {
  test(`native guard reachability preserves absence and effects on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeGuardReachabilitySource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-guard-reachability");
  });
  test(`folded native guards evaluate throwing getters exactly once on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeGuardGetterEffectsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-guard-getter-effects-${surface ?? "native"}`);
  });
  test(`folded native guards evaluate throwing calls exactly once on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let calls = 0;
const failure = new Error("guard call");
function count(): number { return calls; }
function next(): string {
  calls++;
  if (count() === 3) throw failure;
  return "kept";
}
function inspect(): boolean { return typeof next() === "string"; }
export function run(): boolean {
  if (!inspect() || count() !== 1) return false;
  if (!inspect() || count() !== 2) return false;
  try { inspect(); return false; }
  catch (caught) { return count() === 3 && caught === failure; }
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-guard-call-effects-${surface ?? "native"}`);
  });
}

test("exact native header provider omits the impossible number and array paths", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeHeaderReachabilitySource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "native-header-reachability", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});
