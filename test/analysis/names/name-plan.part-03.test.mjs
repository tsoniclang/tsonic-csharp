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
import { analyzeCompletedCsharpProgram, nativeMemberNames, checkedNames, bindingSafeNativeSource } from "./name-plan.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
test(`${surface}: native member hiding and collisions use final physical containers before seal`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Base<T> { read(value: T): number { void value; return 2; } }
      export class Hidden extends Base<number> { static read(value: number): number { return value + 1; } }
      export class Derived extends Base<number> { read(value: number): number { return value + 2; } }
      export class Generic<T> {
        static ready: number = 3;
        ready: number = 4;
        static GetHashCode(): number { return 13; }
      }
      interface Reader { read(): number; }
      class Implemented implements Reader { read(): number { return 8; } }
      function local(): number {
        class Local { static ready: number = 5; ready: number = 6; }
        return Local.ready + new Local().ready;
      }
      export function run(): [number, number, number, number, number, number] {
        return [Hidden.read(3), new Derived().read(3), Generic.ready + new Generic<number>().ready,
          local(), new Implemented().read(), Generic.GetHashCode()];
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const observations = [];
    const visit = node => {
      if (ast.is.IsMethodDeclaration(node)) {
        const owner = ast.parent(node);
        if (owner !== undefined && ast.is.IsClassDeclaration(owner)) observations.push({ node,
          owner: ast.text(ast.name(owner)), name: ast.text(ast.name(node)) });
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    for (const owner of ["Base", "Hidden", "Derived", "Implemented"]) {
      const member = observations.find(entry => entry.owner === owner && entry.name === "read");
      assert.equal(member !== undefined, true, `${owner}: the actual authored method is retained`);
      assert.equal(program.records.nativeMemberHiding.get({ kind: "source", declaration: member.node, role: "member" }), owner === "Hidden",
        `${owner}: only the exact hidden native signature gets new, not overrides or interface implementation`);
    }
    const companion = observations.find(entry => entry.owner === "Generic" && entry.name === "GetHashCode");
    assert.equal(companion !== undefined && program.records.nativeMemberHiding.get({ kind: "source", declaration: companion.node, role: "member" }) === true, true,
      "the separate static companion uses its actual native Object root, not the generic instance's source heritage");
    assert.equal(Object.isFrozen(program.records.nativeMemberHiding), true, "hiding is immutable published data");
    let syntaxReads = 0;
    const foreign = Object.defineProperty({}, "kind", { get() { syntaxReads += 1; throw Error("late name syntax"); } });
    assert.equal(program.records.nativeMemberHiding.get({ kind: "source", declaration: foreign, role: "member" }) === undefined && syntaxReads === 0, true,
      "the sealed hiding getter never computes or inspects a foreign syntax node");
    const hidden = observations.find(entry => entry.owner === "Hidden" && entry.name === "read").node;
    const context = createCsharpPlanningContext({ ...program, records: { ...program.records,
      nativeMemberHiding: { get: subject => subject.kind === "source" && subject.declaration === hidden
        ? undefined : program.records.nativeMemberHiding.get(subject) } } });
    assert.throws(() => planClassMemberModifiers(hidden, ast.name(hidden), context,
      { kind: "source", declaration: hidden, role: "member" }),
      error => error.message.includes("final physical-container hiding decision"),
      "removing only a successfully published hiding decision is a separate producer invariant");
    executeCsharpConstruction(compiled, `native-final-member-names-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != (4d, 5d, 7d, 11d, 8d, 13d))
    throw new System.Exception("native hiding, override and physical class-container identities");
`);
  });
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface}: capture-free pre-seal names preserve nested, local, named and structural native semantics`, () => {
    const compiled = compileCsharpSource({ sourceText: bindingSafeNativeSource, surface });
    assertCsharpCompilationSucceeded(compiled);
    const source = createTargetSourceProgram(compiled.source);
    const file = compiled.source.getSourceFile("/project/index.ts");
    const names = compiled.result.program.names;
    const methods = [];
    const visit = node => {
      if (source.ast.is.IsFunctionDeclaration(node) || source.ast.is.IsMethodSignatureDeclaration(node)) methods.push(node);
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
    const unchanged = new Set(["stable", "rethrowOnly", "unusedCatch", "dormant"]);
    for (const ownerName of ["outer", "local", "destructured", "localSuffix", "uninitialized", "localFunction", "catchUse", ...unchanged]) {
      const owner = methods.find(node => source.ast.text(source.ast.name(node)) === ownerName);
      assert.equal(owner !== undefined, true, `${ownerName}: the real checked callable is present`);
      const declaration = source.ast.typeParameters(owner)[0];
      const parameter = csharpSourceTypeParameter(declaration, source.ast);
      assert.equal(parameter !== undefined, true, `${ownerName}: the original checked binder identity is available`);
      const rename = names.typeParameterNames.find(selected => selected.identity === parameter.identity);
      const expected = unchanged.has(ownerName) ? parameter.name : rename?.name;
      assert.equal(unchanged.has(ownerName) ? rename === undefined : expected !== undefined && expected !== "T" && expected !== "T1", true,
        `${ownerName}: the approved conflict-only suffix cannot capture the authored nested or local T1`);
      for (const node of [source.ast.name(declaration), ...source.navigation.referencesToDeclaration(declaration)]) {
        assert.equal(names.resolve(node).kind === "resolved" && names.resolve(node).name === expected, true,
          `${ownerName}: all checked bound uses consume the same capture-free decision`);
      }
    }
    for (const method of methods.filter(node => source.ast.is.IsMethodSignatureDeclaration(node))) {
      const owner = source.ast.parent(method);
      const sourceName = source.ast.name(owner);
      const declaration = source.ast.typeParameters(method)[0];
      const selected = names.resolve(source.ast.name(declaration));
      const named = sourceName !== undefined && source.ast.text(sourceName) === "NamedGeneric";
      const parameter = csharpSourceTypeParameter(declaration, source.ast);
      assert.equal(parameter !== undefined, true, "the original checked method binder identity is available");
      const rename = names.typeParameterNames.find(candidate => candidate.identity === parameter.identity);
      assert.equal(selected.kind === "resolved" && (named
        ? rename !== undefined && selected.name === rename.name && selected.name !== "T" && selected.name !== "T1"
        : rename === undefined && selected.name === "T"), true,
        "only the actual named interface header conflicts; structural arg0 and erased optional headers preserve authored T");
    }
    executeCsharpConstruction(compiled, `binding-safe-type-parameter-${surface}`);
  });
}
