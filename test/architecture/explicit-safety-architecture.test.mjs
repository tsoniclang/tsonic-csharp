import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("explicit safety reaches the planner through target-owned policy only", () => {
  const explicitSafety = product("src/backend/planner/safety/explicit-safety.ts");
  const nativePointers = product(
    "src/backend/planner/expressions/expression-native-pointers.ts",
  );

  assert.match(explicitSafety, /input\.program\.safetyApplications/u);
  assert.match(nativePointers, /input\.program\.operations\.nativePointer/u);
  assert.doesNotMatch(nativePointers, /selectCsharpNativePointerOperation/u);
  assert.doesNotMatch(
    `${explicitSafety}\n${nativePointers}`,
    /sourceFacts|FactKey|getSymbolAtLocation|getTypeAtLocation|getResolvedSymbol|getResolvedSignature|\.Text\b|\.TypeArguments\b/u,
  );
});

test("C# unsafe permission uses typed syntax traversal", () => {
  const permission = product("src/backend/planner/safety/unsafe-requires.ts");
  const members = product("src/backend/planner/safety/unsafe-members.ts");
  const expressions = product("src/backend/planner/safety/unsafe-expressions.ts");

  assert.match(permission, /memberRequiresUnsafePermission/u);
  assert.match(members, /switch \(member\.kind\)/u);
  assert.match(expressions, /switch \(expression\.kind\)/u);
  assert.doesNotMatch(
    permission,
    /Object\.(?:values|entries|keys)|WeakSet|Record<string, unknown>|\bunknown\b/u,
  );
});

test("C# never restores compilation-wide or containing-type unsafe inference", () => {
  const marking = product("src/backend/planner/safety/unsafe-marking.ts");

  assert.match(marking, /typeDeclarationHeaderRequiresUnsafe/u);
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
  const options = product("src/options/csharp-target-options.ts");
  const projectAnalysis = product(
    "src/analysis/project/classification.ts",
  );
  const properties = product(
    "src/backend/planner/project/project-options.ts",
  );
  const safety = product("src/backend/planner/safety/explicit-safety.ts");

  assert.match(options, /readCsharpLanguageDialect/u);
  assert.match(options, /readCsharpMemorySafetyRules/u);
  assert.match(projectAnalysis, /configuration\.languageDialect/u);
  assert.match(projectAnalysis, /configuration\.memorySafetyRules/u);
  assert.match(properties, /input\.program\.project\.properties/u);
  assert.match(properties, /options\.allowUnsafeBlocks === true/u);
  assert.match(safety, /input\.program\.configuration\.languageDialect/u);
  assert.match(safety, /input\.program\.configuration\.memorySafetyRules/u);
  assert.doesNotMatch(
    `${projectAnalysis}\n${properties}\n${safety}`,
    /readCsharpLanguageDialect|readCsharpMemorySafetyRules/u,
  );
  assert.doesNotMatch(safety, /NativePointer|FunctionPointer|PointerType/u);
});

function product(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}
