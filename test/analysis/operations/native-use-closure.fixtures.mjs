import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery, targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native/native-demand.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const emissionPrograms = [
  ["class and static initializers", `
    function next(): number { return 3; }
    export class Box { value = next(); static shared = next(); }
    export function run(): number { const box = new Box(); return box.value + Box.shared; }`],
  ["base constructor arguments", `import type { int32 } from "@tsonic/core/types.js";
    export class Base { value: int32; constructor(value: int32) { this.value = value; } }
    export class Derived extends Base { constructor() { super(7 / 2); } }
    export function run(): int32 { return new Derived().value; }`],
  ["parameter, pattern and lambda defaults", `
    function next(): number { return 3; }
    function parameter(value: number = next()): number { return value; }
    function pattern([value = next()]: number[]): number { return value; }
    export function run(): number { const callback = (value: number = next()) => value;
      const [item = next()] = [1]; return parameter() + pattern([]) + callback() + item; }`],
  ["template spans", 'export function run(value: number): string { return `value=${value},next=${value + 1}`; }'],
  ["switch cases", `export function run(value: number): number {
    switch (value) { case 1: return 3; case 2: return 4; default: return 5; } }`],
  ["optional chains", `export interface Box { value: number; }
    export function run(box?: Box): number { return box?.value ?? 3; }`],
  ["sequence spread", `function sum(...values: number[]): number { return values.length; }
    export function run(values: number[]): number { const result = [1, ...values, 2]; return sum(...result); }`],
  ["await operands", `async function first(): Promise<number> { return 3; }
    export async function run(): Promise<number> { return await first(); }`],
  ["yield operands", `import type { int32 } from "@tsonic/core/types.js";
    export function* run(): Generator<int32, string, unknown> { yield 1; yield 2; return "done"; }`],
  ["delete, void and typeof", `export function run(values: number[], value: number): string {
    delete values[0]; void value; return typeof value; }`],
  ["comma expression", `export function run(): number { let value = 0; return (value++, value + 1); }`],
  ["accessor bodies", `export class Box { stored = 1; get value(): number { return this.stored; }
    set value(next: number) { this.stored = next; } }
    export function run(): number { const box = new Box(); box.value = 3; return box.value; }`],
  ["IIFE callee", `export function run(value: number): number { return ((next: number) => next + 1)(value); }`],
  ["module and default export", `function next(): number { return 3; }
    const value = next(); export default value;`],
  ["compound and logical assignments and increments", `export function run(): number {
    let value = 1; value += 2; value++; --value; let optional: number | undefined = value; optional ??= 4; return optional; }`],
  ["attribute argument metadata", `import { attribute } from "@tsonic/core/lang.js";
    import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    export class Box { run(): void {} }
    attribute<Box>().add(() => new ObsoleteAttribute("old", false));`],
];

const discardedPrograms = [
  ["as", "(() => 1) as (() => number);"],
  ["non-null", "(() => 1)!;"],
  ["type assertion", "<() => number>(() => 1);"],
  ["void", "void (() => 1);"],
  ["conditional", "flag ? () => 1 : () => 2;"],
  ["logical and", "flag && (() => 1);"],
  ["logical or", "flag || (() => 1);"],
  ["coalescing", "optional ?? (() => 1);"],
  ["comma", "(flag = !flag, (() => 1));"],
  ["nested wrappers", "((flag ? (() => 1) : (() => 2))! satisfies (() => number));"],
];

function owners(sourceText, surface = "js") {
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
  const bindingPatterns = analyzeCsharpBindingPatterns({ ast, semanticsFor: source.semantics.forNode, sourceFiles: csharpProgramSourceFiles(program), participation: records.nativeParticipation,
    evidence: records, operations: records, valueReads: records, objectShapes: program.objectShapes, storage: records,
    initializerUses: { get: declaration => {
      const expression = ast.as.AsVariableDeclaration(declaration)?.Initializer;
      return expression === undefined ? undefined : records.nativeExpression.get(expression)?.physical;
    } },
    typePolicy: { resolveType: () => assert.fail("These native-use closure fixtures require no source-owned member resolution.") },
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
    participation: records.nativeParticipation, bindingPatterns, callableCreation: { get: () => undefined },
    attributeApplications: records, classInitialization: records, projectTypes: program.projectTypes,
    classFactories: { classFactory: records.classFactory, factories: program.classFactories },
    expected: { entries: [], pending: [], inactive: [], expectedUse: { get: () => undefined } } };
  const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/gu, " ");
  const variable = name => nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
  return { ast, nodes, records, input, text, variable };
}

export { emissionPrograms, discardedPrograms, owners };
