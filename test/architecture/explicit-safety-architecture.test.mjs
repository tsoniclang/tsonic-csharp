import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("explicit safety reaches the planner through target-owned policy only", () => {
  const explicitSafety = product("src/backend/planner/safety/explicit-safety.ts");
  const nativePointers = product(
    "src/backend/planner/expressions/native-pointers.ts",
  );
  const planning = product("src/backend/planner/expressions/planning.ts");

  assert.match(explicitSafety, /input\.program\.records\.declarationSafety\.get/u);
  assert.equal([...planning.matchAll(/input\.program\.records\.nativeHandler\.get\(node\)/gu)].length === 1, true,
    "the expression root reads one admitted native handler");
  assert.match(planning, /case "native-pointer":[\s\S]*?planCsharpNativePointerOperation\(\s*node,\s*nativeHandler\.selection/u);
  assert.match(nativePointers, /selection: Extract<CsharpNativeHandler, \{ readonly kind: "native-pointer" \}>\["selection"\]/u);
  assert.doesNotMatch(nativePointers, /input\.program\.records\.(?:memoryBinding|nativePointer|typedLocation|jsStringConversion)\.get/u);
  assert.doesNotMatch(nativePointers, /selectCsharpNativePointerOperation/u);
  assert.doesNotMatch(
    `${explicitSafety}\n${nativePointers}`,
    /sourceFacts|FactKey|getSymbolAtLocation|getTypeAtLocation|getResolvedSymbol|getResolvedSignature|\.Text\b|\.TypeArguments\b/u,
  );
});

test("C# unsafe permission is decided on source before sealing", () => {
  const permission = product("src/analysis/safety/emission.ts");
  const types = product("src/policy/operations/pointers/native-type-safety.ts");
  const planner = product("src/backend/planner/safety/explicit-safety.ts");

  assert.match(permission, /ast\.forEachChild\(node/u);
  assert.match(permission, /selectCsharpTypeUnsafeContext\(carrier\)/u);
  assert.match(permission, /createCsharpSafetyEmissionRecords\(subjects, compilations, declarations, shapes\)/u);
  assert.match(types, /case "pointer": case "function-pointer": return true/u);
  assert.match(planner, /records\.unsafeCompilation\.get\(subject\)/u);
  assert.doesNotMatch(planner, /forEachChild|selectCsharpTypeUnsafeContext|switch \(expression\.kind\)/u);
  assert.doesNotMatch(
    permission,
    /Object\.(?:values|entries|keys)|WeakSet|Record<string, unknown>|\bunknown\b/u,
  );
});

test("C# never restores compilation-wide or containing-type unsafe inference", () => {
  const marking = product("src/analysis/safety/emission.ts");

  assert.match(marking, /const headerContext = children\.some/u);
  assert.match(marking, /const lexicalContext = ast\.is\.IsSourceFile\(node\)/u);
  assert.doesNotMatch(marking, /markCompilationUnitUnsafe/u);
  assert.doesNotMatch(
    marking,
    /declaration\.members\.some\s*\(\s*(?:typeMemberRequiresUnsafe|interfaceMemberRequiresUnsafe)/u,
  );
  assert.equal(
    existsSync(new URL("../../src/backend/planner/unsafe.ts", import.meta.url)),
    false,
  );
});

test("C# language, memory rules, and unsafe permission remain separate controls", () => {
  const options = product("src/options/target.ts");
  const projectAnalysis = product(
    "src/options/project.ts",
  );
  const properties = product(
    "src/backend/planner/project/project-options.ts",
  );
  const safety = product("src/backend/planner/safety/explicit-safety.ts");

  assert.match(options, /readCsharpLanguageDialect/u);
  assert.match(options, /readCsharpMemorySafetyRules/u);
  assert.match(projectAnalysis, /configuration\.languageDialect/u);
  assert.match(projectAnalysis, /configuration\.memorySafetyRules/u);
  assert.match(properties, /input\.program\.records\.compilation\.get\(\)\.project\.properties/u);
  assert.match(properties, /options\.allowUnsafeBlocks === true/u);
  const admission = product("src/analysis/safety/emission.ts");
  assert.match(admission, /input\.configuration\.languageDialect/u);
  assert.match(admission, /input\.configuration\.memorySafetyRules/u);
  assert.match(safety, /records\.declarationSafety\.get/u);
  assert.doesNotMatch(safety, /configuration\.(?:languageDialect|memorySafetyRules)/u);
  assert.doesNotMatch(
    `${projectAnalysis}\n${properties}\n${safety}`,
    /readCsharpLanguageDialect|readCsharpMemorySafetyRules/u,
  );
  assert.doesNotMatch(safety, /NativePointer|FunctionPointer|PointerType/u);
});

function product(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}
