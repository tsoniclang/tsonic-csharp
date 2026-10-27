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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const [description, sourceText] of Array.from([
  ["Function name", "export default function (): number { return 1; }"],
  ["Class name", "export default class { value: number = 1; }"],
]).slice(0, 2)) {
test(`${surface}: an emitted anonymous declaration is refused by source-name admission: ${description}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the declaration name is a target-owned source rule");
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_NAME" &&
      issue.message.startsWith(`${description} must be present`)), true,
    "the actual emitted declaration has a precise pre-seal name refusal");
    assert.equal(compiled.result.program === undefined, true, "no anonymous native declaration is published");
    assert.equal(compiled.result.artifacts.length, 0, "no synthesized declaration or partial artifact is emitted");
  });
}
}

test("native dispatch requires its completed narrow inputs instead of the retired five-argument API", () => {
  assert.throws(() => analyzeCsharpProjectCallableAdapters({}, {}, {}, {}, {}), error => error instanceof Error &&
    error.message.includes("Native callable dispatch requires the open authored-name lookup and completed storage and participation inputs."),
  "the replaced producer API has no optional legacy native-dispatch route");
});

test("a rejected native inheritance acquisition keeps its complete diagnostic before program publication", () => {
  const checked = checkCsharpSource({ sourceText: "export class View { read(): number { return 1; } }" });
  assert.equal(checked.sourceDiagnosticsText, "", "the provider-rejection control is checked source");
  const source = createTargetSourceProgram(checked.source);
  const original = Object.freeze({ numericCode: 91047, category: "error", extensionId: "native-fixture",
    message: "The selected native inheritance input is unavailable.",
    evidence: Object.freeze([Object.freeze({ message: "binding=System.Object" }),
      Object.freeze({ message: "selected-input=exact-native-control" })]) });
  const providers = createCsharpProviderRelationResolver({
    providers: [createDotnetReflectionTypeDataProvider()], providerPolicies: [],
  });
  let acquisitions = 0;
  const result = analyzeCompletedCsharpProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: { ...providers, findTargetBindingByMetadataName(metadataName, purpose) {
      if (metadataName !== "System.Object" || purpose !== "inheritance") {
        return providers.findTargetBindingByMetadataName(metadataName, purpose);
      }
      acquisitions += 1;
      return { kind: "rejected", diagnostic: original };
    } },
  });
  assert.equal(acquisitions, 1, "the selected root is acquired once, with no alias retry");
  assert.equal(result.kind, "rejected", "required native rejection cannot become a false dispatch or hiding row");
  assert.equal(Object.hasOwn(result, "value"), false, "no program or sealed names are published on rejection");
  assert.equal(result.diagnostics.length, 1, "one original native rejection is not duplicated by the name owner");
  const diagnostic = result.diagnostics[0];
  assert.equal(diagnostic.code, `TS${original.numericCode}`, "the existing extension diagnostic code conversion is preserved");
  assert.equal(diagnostic.source, original.extensionId, "original native extension owner");
  assert.equal(diagnostic.category, original.category, "original native category");
  assert.equal(diagnostic.message, original.message, "original native message");
  assert.deepEqual(diagnostic.evidence, original.evidence.map(entry => entry.message), "all original native evidence is retained");
  assert.equal(diagnostic.sourceNode !== undefined && source.ast.is.IsMethodDeclaration(diagnostic.sourceNode), true,
    "the native acquisition remains attached to the actual retained method");
});

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
test(`${surface}: modules, native overrides and synthetic value members use their actual native containers`, () => {
    for (const control of [
      { name: "native-virtual-slot", sourceText: `
        import { Object as NativeObject } from "@tsonic/dotnet/System.js";
        export class View extends NativeObject { override ToString(): string { return "view"; } }
        export function run(): string | undefined { const value: NativeObject = new View(); return value.ToString(); }
      `, invocation: 'if (Tsonic.Generated.Index.run() != "view") throw new System.Exception("native virtual slot");' },
      { name: "module-function", sourceText: "export function GetType(): number { return 1; }",
        invocation: 'if (Tsonic.Generated.Index.GetType() != 1) throw new System.Exception("module function");' },
      { name: "module-property", sourceText: "export const ToString: number = 2;",
        invocation: 'if (Tsonic.Generated.Index.ToString != 2) throw new System.Exception("module property");' },
      { name: "module-direct-lambda", sourceText: "export const GetType = (): number => 3;",
        invocation: 'if (Tsonic.Generated.Index.GetType() != 3) throw new System.Exception("module direct lambda");' },
      { name: "synthetic-struct-field", sourceText: "export function run(): number { const value = { ToString: 4 }; return value.ToString; }",
        invocation: 'if (Tsonic.Generated.Index.run() != 4) throw new System.Exception("synthetic value field");' },
    ]) {
      const compiled = compileCsharpSource({ surface, sourceText: control.sourceText });
      assertCsharpCompilationSucceeded(compiled);
      const generated = [...compiled.artifacts.values()].join("\n");
      if (control.name === "native-virtual-slot") {
        assert.equal(generated.includes("override string ToString(") && !generated.includes("new string ToString("), true,
          "native dynamic dispatch is a real override, never a warning-suppressing hidden method");
      }
      executeCsharpConstruction(compiled, `final-container-${control.name}-${surface}`, false, false, [], control.invocation);
    }
  });

test(`${surface}: native member-name refusals precede publication with their exact admitted diagnostics`, () => {
    for (const control of [
      { sourceText: "export class View { $read(): number { return 1; } }", description: "Method name", name: "$read", field: false },
      { sourceText: "export class View { $value: number = 1; }", description: "Class field", name: "$value", field: true },
      { sourceText: "export class View { get $value(): number { return 1; } }", description: "Accessor name", name: "$value", field: false },
    ]) {
      const compiled = compileCsharpSource({ surface, sourceText: control.sourceText });
      assert.equal(compiled.sourceDiagnosticsText, "", `${control.description}: the original source is checked`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
        `${control.description}: refusal is before records, planning and artifact publication`);
      assert.equal(compiled.targetDiagnostics.length, 1, `${control.description}: one source owner, with no late duplicate reporter`);
      const diagnostic = compiled.result.diagnostics[0];
      assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_NAME", `${control.description}: original code`);
      assert.equal(diagnostic.category, "error", `${control.description}: original category`);
      assert.equal(diagnostic.message,
        `${control.description} cannot be represented as an exact C# target name. Source name '${control.name}' is not a valid C# identifier and has no explicit target-name policy.`,
        `${control.description}: original exact native refusal message`);
      if (control.field) {
        const source = createTargetSourceProgram(compiled.source);
        assert.equal(diagnostic.sourceNode !== undefined && source.ast.is.IsPropertyDeclaration(diagnostic.sourceNode) &&
          source.ast.text(source.ast.name(diagnostic.sourceNode)) === control.name, true, "C429 selects the owning field node");
      } else assert.equal(diagnostic.sourceNode === undefined, true, `${control.description}: original node absence is preserved`);
    }
    const admitted = compileCsharpSource({ surface, sourceText: "export class View { value: number = 1; }" });
    assertCsharpCompilationSucceeded(admitted);
    const program = admitted.result.program;
    const ast = program.source.ast;
    const declaration = ast.statements(csharpProgramSourceFiles(program)[0]).find(node => ast.is.IsClassDeclaration(node));
    const field = ast.members(declaration).find(node => node !== undefined && ast.is.IsPropertyDeclaration(node));
    assert.equal(field !== undefined, true, "the separate corruption control starts with a real admitted field");
    assert.throws(() => planCsharpAdmittedMemberName({ sourceName: { get: () => ({ kind: "rejected", reason: "corrupted admitted name" }) } },
      ast.name(field)),
    /An admitted native member lost its final representable name/u, "corruption is an invariant, not a second source-refusal owner");
  });
}
