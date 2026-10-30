import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram, analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { analyzeCsharpExpectedTypes } from "../../../dist/analysis/expected-types/analyze.js";
import { admitCsharpExpectedNativeUses } from "../../../dist/analysis/expected-types/native-uses.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { publishedGenericProjections } from "../../helpers/expected-native-uses.mjs";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";

function owners(sourceText, surface = "native") {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, compiled.result.diagnostics.map(item => `${item.code}: ${item.message}`).join("; "));
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const records = program.records;
  const nodes = [];
  const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
  for (const file of csharpProgramSourceFiles(program)) walk(file);
  const participation = records.nativeParticipation;
  const bindingPatterns = analyzeCsharpBindingPatterns({ ast, semanticsFor: source.semantics.forNode, sourceFiles: csharpProgramSourceFiles(program), participation, evidence: records,
    operations: records, valueReads: records, objectShapes: program.objectShapes, storage: records,
    initializerUses: { get: declaration => {
      const expression = ast.as.AsVariableDeclaration(declaration)?.Initializer;
      return expression === undefined ? undefined : records.nativeExpression.get(expression)?.physical;
    } },
    typePolicy: { resolveType: () => assert.fail("These native-use fixtures require no source-owned member resolution.") },
    conversionPolicy: { target: compiled.target, typeDefinitions: program.typeDefinitions, objectShapes: program.objectShapes,
      providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
      projectTypes: { directSupertypes: type => {
        const heritage = program.projectTypes.heritageForTarget(type);
        return heritage === undefined ? undefined : heritage.baseType === undefined
          ? heritage.interfaces : [heritage.baseType, ...heritage.interfaces];
      } } } });
  const input = { ast, sourceFiles: csharpProgramSourceFiles(program), navigation: program.sourceNavigation, evidence: records, operations: records,
    nativeExpressionIssues: [], sourceStorage: createSourceStorageQuery(source, csharpProgramSourceFiles(program)),
    declarations: records, objectShapes: program.objectShapes,
    exactLiteral: records.exactLiteral, propertyKeyBindings: expression => {
      const use = records.nativeExpression.get(expression)?.use;
      return use === undefined || use.kind === "erased" ? undefined : use.propertyKeys;
    },
    valueReads: records, optionalLocals: { get: node => records.localBinding.get(node)?.optionalLocal },
    participation, bindingPatterns, callableCreation: { get: node => {
      const closure = records.captureClosure.get(node);
      return closure === undefined ? undefined : { kind: "selected", carrier: closure.method.type };
    } }, attributeApplications: records, classInitialization: records, projectTypes: program.projectTypes,
    classFactories: { classFactory: records.classFactory, factories: program.classFactories },
    expected: { entries: [], pending: [], inactive: [], expectedUse: { get: () => undefined } } };
  const contracts = nodes.filter(node => ast.is.IsFunctionDeclaration(node) && ast.body(node) !== undefined).flatMap(node => {
    const declared = records.returnContract.get(node);
    return declared?.kind === "resolved" ? [{ sourceDeclaration: node, returnType: declared.type }] : [];
  });
  const literalValues = analyzeSourceLiteralValues(ast, csharpProgramSourceFiles(program));
  const expected = analyzeCsharpExpectedTypes({ ast, sourceFiles: csharpProgramSourceFiles(program), literalValues,
    semantics: source.semantics.forFile, semanticsFor: source.semantics.forNode, typeDefinitions: program.typeDefinitions }, records, records, program.objectShapes,
    { declarationContracts: contracts, closedInputType: () => undefined, get: () => undefined },
    { get: node => { const read = records.valueRead.get(node); return read === undefined ? undefined
      : { literalTarget: read.selectedOperation ?? read.source, operationValue: read.selectedOperation ?? read.source }; } }, records,
    publishedGenericProjections(records, nodes));
  const exact = analyzeCsharpExactLiteralSelections(literalValues, [
    ...expected.constructions.propertyKeyRequests,
    ...expected.nativeUseSites.requests.flatMap(request =>
      request.expression === undefined ? [] : [{ expression: request.expression, target: request.targetType }]),
  ], nodes);
  input.propertyKeyBindings = expected.constructions.propertyKeys;
  input.exactLiteral = exact.exactLiteral;
  input.expected = admitCsharpExpectedNativeUses(expected, { ast, exactLiteral: exact.exactLiteral, callableCreation: input.callableCreation,
    valueRead: records.valueRead, absentValue: { get: () => false }, operations: records });
  const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/gu, " ");
  return { program, records, nodes, ast, input, text };
}

for (const surface of ["native", "js"]) test(`${surface} finite native uses cover exact calls, writes, updates and branch roots`, () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    function identity(value: int32): int32 { return value; }
    export function run(value: int32): int32 {
      let result = identity(value);
      result++;
      if (result > 0) result = value;
      return result > 1 ? result : value;
    }`, surface);
  const demand = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(demand.unadmitted.length, 0, demand.unadmitted.map(entry => `${entry.reason}: ${value.text(entry.expression)}`).join("; "));
  assert.equal(demand.entries.some(entry => entry.site.role.includes("argument:source=0:effective=0:parameter=0:source-parameter=0") &&
    value.text(entry.use.expression) === "value"), true, "U4 exact grouping is retained");
  assert.equal(demand.entries.some(entry => entry.use.kind === "location" && entry.site.role === "update-target"), true, "native-uses:63: demand.entries.some(entry => entry.use.kind === \"location\" && entry.site.role === \"update-");
  assert.equal(demand.entries.some(entry => entry.use.kind === "location" && entry.site.role === "write-target"), true, "native-uses:64: demand.entries.some(entry => entry.use.kind === \"location\" && entry.site.role === \"write-t");
  const conditional = demand.entries.find(entry => entry.use.kind !== "erased" && entry.use.evaluation.kind === "conditional");
  assert.equal(conditional !== undefined && conditional.use.children.length === 3, true, "condition and two alternatives are explicit");
  assert.equal(Object.isFrozen(demand) && Object.isFrozen(demand.entries) && demand.entries.every(entry => Object.isFrozen(entry.use)), true, "native-uses:67: Object.isFrozen(demand) && Object.isFrozen(demand.entries) && demand.entries.every(entry =");
  assert.equal(Object.hasOwn(value.program.records, "nativeUse"), true, "the final owner publishes the one canonical native-use family");
  assert.equal(typeof value.program.records.nativeExpression.get, "function", "the backend consumes exact sealed emission contexts");
});

test("class initialization, base constructor arguments and callable defaults each have one native root", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    export class Base { constructor(public value: int32) {} }
    export class Child extends Base {
      field: int32 = 3;
      static count: int32 = 4;
      constructor(value: int32) { super(value); }
      method(value: int32 = 5): int32 { return value; }
    }`);
  const demand = analyzeCsharpNativeDemand(value.input, []);
  const base = value.nodes.find(node => value.ast.is.IsCallExpression(node) &&
    value.ast.kindName(value.ast.as.AsCallExpression(node)?.Expression) === "KindSuperKeyword");
  const argument = value.ast.arguments(base)[0];
  assert.equal(base !== undefined && argument !== undefined, true, "one actual super call and source argument");
  assert.equal(demand.entries.filter(entry => entry.site.subject === base && entry.use.expression === argument &&
    entry.site.role.startsWith("argument:source=0:effective=0")).length, 1,
    "the canonical selected-call argument is not visited again through the constructor body");
  assert.equal(demand.entries.filter(entry => entry.site.role === "initializer" && ["3", "4"].includes(value.text(entry.use.expression))).length, 2, "native-uses:83: demand.entries.filter(entry => entry.site.role === \"initializer\" && [\"3\", \"4\"].includes(va");
  assert.equal(demand.entries.some(entry => entry.site.role === "default" && value.text(entry.use.expression) === "5"), true, "native-uses:84: demand.entries.some(entry => entry.site.role === \"default\" && value.text(entry.use.express");
  assert.equal(demand.unadmitted.length, 0, demand.unadmitted.map(entry => `${entry.reason}: ${value.text(entry.expression)}`).join("; "));
});

test("erased and frame-body participation are consumed as recorded, not rescanned from source declarations", () => {
  const value = owners(`export function run(): number {
    let total = 0;
    for (let index = 0; index < 3; index++) {
      function add(): void { total += index; }
      add();
    }
    return total;
  }`);
  const nested = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) && value.ast.text(value.ast.name(node)) === "add");
  assert.equal(value.records.nativeParticipation.get(nested), "body", "approved C-1432: the original non-generic local function has an ordinary native body");
  const demand = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(demand.nativeUse.order(nested) !== undefined, true, "frame methods still compile their body");
  const erased = analyzeCsharpNativeDemand({ ...value.input, participation: { get: node => node === nested ? "erased" : value.records.nativeParticipation.get(node) } }, []);
  assert.equal(erased.nativeUse.order(nested)?.length, 0, "the same finite source observes the supplied final participation");
});
