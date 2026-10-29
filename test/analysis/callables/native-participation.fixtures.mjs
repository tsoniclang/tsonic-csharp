import assert from "node:assert/strict";
import test from "node:test";
import { createSourceStorageQuery, defaultSourceStorageLimits } from "@tsonic/target-api/analysis";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource, compileCsharpAnalysisTarget } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpNativeParticipation } from "../../../dist/analysis/callables/calls/participation.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../../../dist/analysis/declarations/type-only.js";

function analyze(sourceText, surface = "native") {
  let source;
  const compiled = compileCsharpSource({ sourceText, surface, compileTarget: (request, observer) => {
    source = request.input.source;
    return compileCsharpAnalysisTarget(request, observer);
  } });
  assertCsharpCheckingSucceeded(compiled);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "valid source analysis");
  assert.equal(Object.hasOwn(program.records, "nativeParticipation"), true, "one published participation reader");
  const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
  assert.equal(storage.failureReason(), undefined, "bounded owned source domain");
  return { source, ast: source.ast, nodes: source.navigation.nodesForFiles(source.navigation.sourceFiles), program, compiled };
}

function labels(value) {
  const { ast } = value;
  const participation = value.program.records.nativeParticipation;
  return value.nodes.flatMap(node => {
    const selected = participation.get(node);
    if (selected === undefined) return [];
    const name = ast.name(node);
    const parent = ast.parent(node);
    const owner = name !== undefined ? ast.text(name)
      : parent !== undefined && ast.is.IsVariableDeclaration(parent) ? ast.text(ast.name(parent)) : "";
    return [`${ast.kindName(node)}:${owner}:${selected}`];
  });
}

const ambientOriginal = active => `
declare const external: number;
export function run(): number {
  function hidden(): number { return external; }
  return ${active ? "hidden()" : "42"};
}`;

const ambientCases = [
  { name: "original dormant", sourceText: ambientOriginal(false), errors: 0, references: 1, call: "Subject.run()",
    erased: ["hidden"], forbidden: ["external", "hidden"] },
  { name: "original active", sourceText: ambientOriginal(true), errors: 1, references: 1 },
  { name: "stored callable subtree", sourceText: `declare const external: number;
    export function run(): number {
      const unused = () => { function nested(): number { return external; } return nested(); };
      void unused; return 42;
    }`, errors: 1, references: 1 },
  { name: "erased callable subtree", sourceText: `declare const external: number;
    export function run(): number {
      (() => { function nested(): number { return external; } return nested(); });
      return 42;
    }`, errors: 0, references: 1, call: "Subject.run()", erased: [], forbidden: ["external", "nested"] },
  { name: "type-only query", sourceText: `declare const external: number;
    export type External = typeof external;
    export function run(value: External): number { return value; }`, errors: 0, references: 0,
    call: "Subject.run(42D)", erased: [], forbidden: ["external"] },
  { name: "ordinary shadow", sourceText: `declare const external: number;
    export function run(): number { const external = 42; return external; }`, errors: 0, references: 0,
    call: "Subject.run()", erased: [], forbidden: [] },
  { name: "actual alias", sourceText: `declare const external: number;
    export function run(): number { const value = external; return value; }`, errors: 1, references: 1 },
  { name: "retained callback", sourceText: `declare const external: number;
    export function run(): () => number { return () => external; }`, errors: 1, references: 1 },
  { name: "actual module initializer", sourceText: `declare const external: number;
    export const value = external;`, errors: 1, references: 1 },
  { name: "distinct actual references", sourceText: `declare const external: number;
    export function run(): number { const first = external; const second = external; return first + second; }`, errors: 2, references: 2 },
];

export { analyze, labels, ambientOriginal, ambientCases };
