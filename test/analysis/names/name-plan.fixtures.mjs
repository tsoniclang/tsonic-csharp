import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { createCsharpSourceNameBuilder } from "../../../dist/analysis/names/plan.js";
import { analyzeCsharpAnalysisProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { createCsharpTargetConfiguration } from "../../../dist/compilation/configuration.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { createCsharpSyntheticNames } from "../../../dist/backend/planner/names/synthetic.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { createDotnetReflectionTypeDataProvider } from "../../helpers/dotnet-reflection-provider.mjs";
import { planClassMemberModifiers } from "../../../dist/backend/planner/declarations/classes/modifiers.js";
import { planCsharpAdmittedMemberName } from "../../../dist/backend/planner/declarations/modifiers.js";
import { analyzeCsharpProjectCallableAdapters } from "../../../dist/analysis/project-types/callable-adapters.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { completeCsharpAnalysisRequest } from "../../helpers/analysis-request.mjs";

const analyzeCompletedCsharpProgram = request => analyzeCsharpAnalysisProgram(completeCsharpAnalysisRequest(request));

const nativeMemberNames = Object.freeze({ issues: Object.freeze([]), memberHiding: Object.freeze([]) });

function checkedNames(sourceText) {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files: { "/project/index.ts": sourceText },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  assert.ok(file);
  const builder = createCsharpSourceNameBuilder({
    ast: source.ast,
    navigation: source.navigation,
    sourceFiles: [file],
    sourceIdentities: { node: () => undefined },
    semanticsFor: source.semantics.forNode,
  });
  const identifiers = [];
  const nodes = [];
  const bindingRoots = [];
  const visit = node => {
    nodes.push(node);
    if (source.ast.is.IsIdentifier(node)) identifiers.push(node);
    if (source.ast.is.IsParameterDeclaration(node) || source.ast.is.IsVariableDeclaration(node) ||
      source.ast.is.IsForOfStatement(node) || source.ast.is.IsForInStatement(node) ||
      source.ast.is.IsFunctionDeclaration(node)) bindingRoots.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  return { source, builder, identifiers, nodes, bindingRoots: Object.freeze(bindingRoots) };
}

const bindingSafeNativeSource = `
type Reader = { read<T>(T: T): T };
interface NamedGeneric { read<T>(T: T): T; }
interface Optional { read?<T>(T: T): T; }
class ReaderBody {
  read<Native>(value: Native): Native { return value; }
}
export function outer<T>(T: T): T {
  function inner<T1>(other: T1, value: T): T { return value; }
  return inner<boolean>(true, T);
}
export function local<T>(value: T): T { const T = value; return T; }
export function destructured<T>({ saved: T }: { saved: T }): T { return T; }
export function localSuffix<T>(T: T): T { const T1 = 1; if (T1 === 1) return T; return T; }
export function uninitialized<T>(value: T): T { let T: T | undefined; if (T === undefined) return value; return T; }
export function localFunction<T>(value: T): T { function T(other: T): T { return other; } return T(value); }
export function catchUse<T>(value: T): T {
  try { throw new Error("value"); }
  catch (T) { if (T instanceof Error) return value; throw T; }
}
export function rethrowOnly<T>(value: T): T { try { return value; } catch (T) { throw T; } }
export function unusedCatch<T>(value: T): T { try { return value; } catch (T) { return value; } }
export function dormant<T>(value: T): T { function hidden<U>(T: U): U { return T; } return value; }
export function stable<U>(value: U): U { return value; }
export function readNamed(): number {
  const value: NamedGeneric = new ReaderBody(); return value.read<number>(17);
}
export function readStructural(): number {
  const value: Reader = new ReaderBody(); return value.read<number>(19);
}
export function run(): boolean {
  return outer<number>(7) === 7 && local<number>(11) === 11 &&
    destructured<number>({ saved: 13 }) === 13 && localSuffix<number>(23) === 23 &&
    stable<number>(29) === 29 && readNamed() === 17 && readStructural() === 19 &&
    uninitialized<number>(31) === 31 && localFunction<number>(37) === 37 && catchUse<number>(41) === 41 &&
    rethrowOnly<number>(43) === 43 && unusedCatch<number>(47) === 47 && dormant<number>(53) === 53;
}
`;

export { analyzeCompletedCsharpProgram, nativeMemberNames, checkedNames, bindingSafeNativeSource };
