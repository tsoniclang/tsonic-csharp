import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";

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
  for (const file of program.sourceFiles) walk(file);
  const participation = records.nativeParticipation;
  const bindingPatterns = analyzeCsharpBindingPatterns({ ast, sourceFiles: program.sourceFiles, participation, evidence: records,
    operations: records, valueReads: records, objectShapes: program.objectShapes });
  const input = { ast, sourceFiles: program.sourceFiles, navigation: program.sourceNavigation, evidence: records, operations: records,
    valueReads: records, participation, bindingPatterns, callableCreation: { get: node => {
      const closure = records.captureClosure.get(node);
      return closure === undefined ? undefined : { kind: "selected", carrier: closure.method.type };
    } }, attributeApplications: records, classInitialization: records, projectTypes: program.projectTypes,
    classFactories: { classFactory: records.classFactory, factories: program.classFactories },
    expected: { entries: [], pending: [], inactive: [], expectedUse: { get: () => undefined } } };
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
  const demand = analyzeCsharpNativeDemand(value.input);
  assert.equal(demand.unadmitted.length, 0, demand.unadmitted.map(entry => `${entry.reason}: ${value.text(entry.expression)}`).join("; "));
  assert.equal(demand.entries.some(entry => entry.site.role.includes("argument:source=0:effective=0:parameter=0:source-parameter=0") &&
    value.text(entry.use.expression) === "value"), true, "U4 exact grouping is retained");
  assert.equal(demand.entries.some(entry => entry.use.kind === "location" && entry.site.role === "update-target"), true);
  assert.equal(demand.entries.some(entry => entry.use.kind === "location" && entry.site.role === "write-target"), true);
  const conditional = demand.entries.find(entry => entry.use.kind !== "erased" && entry.use.evaluation.kind === "conditional");
  assert.equal(conditional !== undefined && conditional.use.children.length === 3, true, "condition and two alternatives are explicit");
  assert.equal(Object.isFrozen(demand) && Object.isFrozen(demand.entries) && demand.entries.every(entry => Object.isFrozen(entry.use)), true);
  assert.equal(Object.hasOwn(value.program.records, "nativeUse"), false, "no program/backend composition in N5");
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
  const demand = analyzeCsharpNativeDemand(value.input);
  const counts = role => demand.entries.filter(entry => entry.site.role === role).length;
  assert.equal(counts("base-argument:source=0"), 1, "super arguments are not visited again through the constructor body");
  assert.equal(demand.entries.filter(entry => entry.site.role === "initializer" && ["3", "4"].includes(value.text(entry.use.expression))).length, 2);
  assert.equal(demand.entries.some(entry => entry.site.role === "default" && value.text(entry.use.expression) === "5"), true);
  assert.equal(demand.unadmitted.length, 0, demand.unadmitted.map(entry => `${entry.reason}: ${value.text(entry.expression)}`).join("; "));
});

test("erased and frame-body participation are consumed as recorded, not rescanned from source declarations", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32): int32 { function nested(): int32 { return value; } return nested(); }`);
  const nested = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) && value.ast.text(value.ast.name(node)) === "nested");
  assert.equal(value.records.nativeParticipation.get(nested), "frame-body");
  const demand = analyzeCsharpNativeDemand(value.input);
  assert.equal(demand.nativeUse.order(nested) !== undefined, true, "frame methods still compile their body");
  const erased = analyzeCsharpNativeDemand({ ...value.input, participation: { get: node => node === nested ? "erased" : value.records.nativeParticipation.get(node) } });
  assert.equal(erased.nativeUse.order(nested)?.length, 0, "the same finite source observes the supplied final participation");
});
