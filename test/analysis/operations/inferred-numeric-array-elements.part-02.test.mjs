import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { isCsharpStringTargetType, isCsharpJsStringTargetType } from "../../../dist/target-model/types/identity.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpDeclarations } from "../../../dist/analysis/declarations/analyze.js";
import { csharpRuntimeUnionTargetType, csharpTargetNamedType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { header, emptyProviders, compile, diagnosticLabel, accepted, arrays, constructedArrays, destinationBodies, actualDestinationEvidence, actualUnionDestinationEvidence } from "./inferred-numeric-array-elements.fixtures.mjs";

for (const surface of ["native", "js"]) {
  for (const [name, element, token, primitive] of [
    ["floating", "string | number", "-9007199254740993", "float64"],
    ["minimum signed integer", "string | int32", "-2147483648", "int32"],
  ]) {
    test(`${surface} declared ${name} union admits the entire authored unary literal`, () => {
      const program = accepted(compile(surface, `export function run(): (${element})[] { return [${token}]; }`));
      const ast = program.source.syntax;
      const literals = [];
      const visit = node => {
        if (ast.is.IsPrefixUnaryExpression(node)) literals.push(node);
        ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      for (const file of csharpProgramSourceFiles(program)) visit(file);
      assert.equal(literals.length, 1, "one original authored signed token is retained");
      const node = literals[0];
      const source = program.source.facts.values.type(node);
      assert.equal(source?.kind !== "refused" && source?.type.kind === "union" && source.type.types.length === 2, true,
        "the Host keeps the complete declared union, not a target-selected scalar arm");
      const selected = program.records.unaryOperation.get(node)?.target;
      assert.equal(selected?.kind === "resolved" && selected.operandType.kind === "source-primitive" &&
        selected.operandType.name === primitive && selected.resultType.kind === "source-primitive" &&
        selected.resultType.name === primitive, true, "D2 admits the signed token before native operator validation");
      const exact = program.records.exactLiteral.get(node, csharpSourcePrimitiveTargetType(primitive));
      assert.equal(primitive === "float64" ? exact?.kind === "source-representation"
        : exact?.kind === "resolved" && exact.recipe.kind === "integer" && exact.recipe.value === -2147483648n, true,
      "the complete signed token retains its existing exact native admission recipe");
      const use = program.records.nativeExpression.get(node)?.use;
      assert.equal(use?.kind === "converted" && use.input.kind === "value" &&
        use.input.type.kind === "source-primitive" && use.input.type.name === primitive, true,
      "one physical scalar enters the original union carrier without an invented source type");
    });
  }
}

const c19PhysicalDestinationKeys = new Set([
  "native actual argument destination changes physical i32 element storage",
  "native actual return destination changes physical i32 element storage",
  "native actual async destination changes physical i32 element storage",
  "native actual nested destination changes physical i32 element storage",
  "js actual argument destination changes physical i32 element storage",
  "js actual return destination changes physical i32 element storage",
  "js actual async destination changes physical i32 element storage",
  "js actual nested destination changes physical i32 element storage",
  "native actual explicit generic argument destination changes physical i32 element storage",
  "native actual explicit generic callback destination changes physical i32 element storage",
  "native actual native generic receiver destination changes physical i32 element storage",
  "native actual typed callback destination changes physical i32 element storage",
  "js actual explicit generic argument destination changes physical i32 element storage",
  "js actual explicit generic callback destination changes physical i32 element storage",
  "js actual native generic receiver destination changes physical i32 element storage",
  "js actual typed callback destination changes physical i32 element storage",
]);

for (const surface of ["native", "js"]){
for (const [name, body] of [
    ["alias", "type Values = float32[]; export function run(value: float32): Values { const result: Values = [value, 1]; return result; }"],
    ["argument", "function first(values: float32[]): float32 { return values[0]; } export function run(value: float32): float32 { return first([value, 1]); }"],
    ["return", "export function run(value: float32): float32[] { const result = [value, 1]; return result; }"],
    ["async", "export async function run(value: float32): Promise<float32[]> { return [value, 1]; }"],
    ["concise arrow", "export function run(value: float32): float32 { const make = (): float32[] => [value, 1]; return make()[0]; }"],
    ["nested callback", "function call(make: () => float32[]): float32[] { return make(); } export function run(value: float32): float32 { return call(() => [value, 1])[0]; }"],
  ]){
test(`${surface} actual ${name} destination reaches the same numeric owner`, () => {
    accepted(compile(surface, body));
  });
}

for (const [name, body] of Object.entries(destinationBodies)){
const physicalKey = `${surface} actual ${name} destination changes physical i32 element storage`;
test(physicalKey, () => {
    const source = body("float32", "runSingle") + body("number", "runDouble");
    if (c19PhysicalDestinationKeys.has(physicalKey)) {
      const compiled = compile(surface, source);
      assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
      const ast = compiled.nativeStage.source.syntax;
      const issues = compiled.result.diagnostics;
      assert.equal(issues.length === 2 && issues.every(issue => {
        const matching = compiled.nativeStage.source.facts.refusals().filter(refusal =>
          refusal.code === "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS" && refusal.site === issue.sourceNode);
        const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
        const text = range?.kind !== "authored" ? undefined
          : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
        return issue.code === "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS" &&
          issue.source === "tsonic" && matching.length === 1 && issue.message === matching[0].reason &&
          issue.message === "This array literal mixes different fixed source types. Annotate the array and convert its elements explicitly." &&
          text === "[narrow, signed]";
      }), true, `${name}: both original open constructions keep their exact C19 refusal; ${diagnosticLabel(compiled)}`);
      assert.equal(new Set(issues.map(issue => issue.sourceNode)).size === 2, true,
        `${name}: each original physical construction has its own checked rejection occurrence`);
      assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
        `${name}: no rejected construction reaches sealing or emission`);
      return;
    }
    const program = accepted(compile(surface, source));
    actualDestinationEvidence(program, ["float32", "float64"], name);
  });
  if (c19PhysicalDestinationKeys.has(physicalKey)) {
    test(`${surface} annotated ${name} destination preserves physical i32 element storage`, () => {
      const single = body("float32", "runSingle");
      const double = body("number", "runDouble");
      const annotatedSingle = single.replace("const values = [narrow, signed]", "const values: float32[] = [narrow, signed]");
      const annotatedDouble = double.replace("const values = [narrow, signed]", "const values: number[] = [narrow, signed]");
      assert.equal(annotatedSingle !== single && annotatedDouble !== double, true,
        `${name}: the companions annotate only the original two local declarations`);
      const program = accepted(compile(surface, annotatedSingle + annotatedDouble));
      actualDestinationEvidence(program, ["float32", "float64"], name);
    });
  }
}

for (const [name, body] of Object.entries(destinationBodies)){
test(`${surface} actual ${name} closed union destination preserves explicit native rounding`, () => {
    const source = body("(string | number)", "run").replaceAll("[narrow, signed]",
      '["text", 9007199254740993, -9007199254740993, 1e100]');
    const program = accepted(compile(surface, source));
    actualUnionDestinationEvidence(program, name);
  });
}
}
