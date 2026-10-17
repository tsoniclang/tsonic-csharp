import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

const header = 'import type { float32, float64, int16, uint16, int32, uint32, int64 } from "@tsonic/core/types.js";';
const compile = (surface, body) => compileCsharpSource({ surface, sourceText: `${header}\n${body}` });
const accepted = compiled => {
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  return compiled.result.program;
};
function arrays(program) {
  const selected = new Map();
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) {
      const initializer = ast.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) selected.set(ast.text(ast.name(node)),
        getCsharpArrayLiteralElementTargetType(program.records.valueRead.get(initializer)?.value));
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  return selected;
}

for (const surface of ["native", "js"]) {
  for (const type of ["int32", "uint32"]) for (const order of ["narrow, value", "value, narrow"]) {
    test(`${surface} inferred float32/${type} refuses precision loss (${order})`, () => {
      const compiled = compile(surface, `export function run(narrow: float32, value: ${type}): number {
        const values = [${order}]; return values[0]; }`);
      assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
      assert.equal(compiled.result.program === undefined, true, "inferred precision is refused before the program seal");
      assert.equal(compiled.targetDiagnostics.length === 1 &&
        compiled.targetDiagnostics[0].code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
        compiled.targetDiagnostics[0].message === "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion.",
      true, "one exact source diagnostic, never an internal missing fact or artificial f64 rescue");
      assert.equal(compiled.artifacts.size, 0, "a precision refusal publishes no generated artifact");
    });
  }
  test(`${surface} native float32 inference and actual explicit destinations preserve their distinct contracts`, () => {
    const program = accepted(compile(surface, `
      export function inferred(narrow: float32, signed: int16, unsigned: uint16): number {
        const narrowSigned = [narrow, signed]; const narrowUnsigned = [unsigned, narrow];
        const signedNarrow = [signed, narrow]; const unsignedNarrow = [narrow, unsigned];
        const half = [narrow, 0.5]; const quarter = [1.25, narrow]; const decimal = [narrow, 0.1];
        const halfReverse = [0.5, narrow]; const decimalReverse = [0.1, narrow];
        const computed = [narrow, 0.5 as float64];
        return narrowSigned[0] + narrowUnsigned[1] + signedNarrow[1] + unsignedNarrow[0] + half[1] +
          quarter[0] + halfReverse[0] + decimal[1] + decimalReverse[0] + computed[1];
      }
      export function explicit(narrow: float32, signed: int32): number {
        const actualDouble: number[] = [narrow, signed]; const actualSingle: float32[] = [narrow, signed];
        return actualDouble[1] + actualSingle[1];
      }`));
    const carriers = arrays(program);
    for (const name of ["narrowSigned", "narrowUnsigned", "signedNarrow", "unsignedNarrow", "half", "quarter", "halfReverse", "actualSingle"]) assert.equal(
      carriers.get(name)?.kind === "source-primitive" && carriers.get(name)?.name === "float32", true,
      `${name}: exact inference or actual authored native float32 storage`);
    for (const name of ["decimal", "decimalReverse", "computed", "actualDouble"]) assert.equal(
      carriers.get(name)?.kind === "source-primitive" && carriers.get(name)?.name === "float64", true,
      `${name}: actual float64 need is not narrowed or rounded twice`);
  });
  test(`${surface} bare two arms and integer literal three arms retain every physical contribution`, () => {
    const program = accepted(compile(surface, `
      export function run(signed: int32, unsigned: uint32): boolean {
        const bare = [signed, unsigned]; const reverse = [unsigned, signed];
        const left = [signed, unsigned, 1]; const middle = [signed, 1, unsigned]; const right = [1, signed, unsigned];
        const wrapped = [signed, unsigned, ((1))];
        return bare[0] === signed && bare[1] === unsigned && reverse[0] === unsigned && reverse[1] === signed &&
          left[0] === signed && left[1] === unsigned && left[2] === 1 &&
          middle[0] === signed && middle[1] === 1 && middle[2] === unsigned &&
          right[0] === 1 && right[1] === signed && right[2] === unsigned &&
          wrapped[0] === signed && wrapped[1] === unsigned && wrapped[2] === 1;
      }
      const signed: int32 = 1; const wide: int64 = 9007199254740993n;
      export const genuine = [signed, wide]; export const sameWide = [wide, wide];`));
    const carriers = arrays(program);
    for (const name of ["bare", "reverse"]) {
      const arms = getCsharpRuntimeUnionArms(carriers.get(name), program.typeDefinitions);
      assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "int32") &&
        arms.some(arm => arm.kind === "source-primitive" && arm.name === "uint32"), true,
      `${name}: the retained original source/native pair is not cut`);
    }
    for (const name of ["left", "middle", "right", "wrapped"]) {
      const arms = getCsharpRuntimeUnionArms(carriers.get(name), program.typeDefinitions);
      assert.equal(arms?.length === 3 && ["int32", "uint32", "float64"].every(kind =>
        arms.some(arm => arm.kind === "source-primitive" && arm.name === kind)), true,
      `${name}: actual integer peers and the canonical f64 literal arm remain distinct`);
    }
    const genuine = getCsharpRuntimeUnionArms(carriers.get("genuine"), program.typeDefinitions);
    assert.equal(genuine?.length === 2 && ["int32", "int64"].every(kind => genuine.some(arm =>
      arm.kind === "source-primitive" && arm.name === kind)), true, "the genuine checked native union is not numerically joined");
    assert.equal(carriers.get("sameWide")?.kind === "source-primitive" && carriers.get("sameWide")?.name === "int64", true,
      "a homogeneous exact native wide array never takes a floating route");
  });
  for (const [name, body] of [
    ["alias", "type Values = float32[]; export function run(value: float32): Values { const result: Values = [value, 1]; return result; }"],
    ["argument", "function first(values: float32[]): float32 { return values[0]; } export function run(value: float32): float32 { return first([value, 1]); }"],
    ["return", "export function run(value: float32): float32[] { const result = [value, 1]; return result; }"],
    ["async", "export async function run(value: float32): Promise<float32[]> { return [value, 1]; }"],
    ["concise arrow", "export function run(value: float32): float32 { const make = (): float32[] => [value, 1]; return make()[0]; }"],
    ["nested callback", "function call(make: () => float32[]): float32[] { return make(); } export function run(value: float32): float32 { return call(() => [value, 1])[0]; }"],
  ]) test(`${surface} actual ${name} destination reaches the same numeric owner`, () => {
    accepted(compile(surface, body));
  });
  test(`${surface} an erased callable does not admit or reject its numeric body`, () => {
    accepted(compile(surface, `export function run(narrow: float32, signed: int32): number {
      const unused = () => { const values = [narrow, signed]; return values[0]; }; void unused; return 7; }`));
  });
  test(`${surface} an authored integer outside the canonical floating arm is refused without a native-integer cap`, () => {
    const compiled = compile(surface, `export function run(signed: int32, unsigned: uint32): number {
      const values = [signed, unsigned, 9007199254740993]; return values[0]; }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0 && compiled.targetDiagnostics.length === 1 &&
      compiled.targetDiagnostics[0].code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      compiled.targetDiagnostics[0].message === "An inferred numeric union requires an exact canonical carrier for every authored integer literal.", true,
    "the actual f64 union arm cannot round the authored integer; exact native int64 values remain separately admitted");
    const program = accepted(compile(surface, `export function run(signed: int32, unsigned: uint32) {
      const values = [signed, unsigned, 9007199254740992]; return values; }`));
    const arms = getCsharpRuntimeUnionArms(arrays(program).get("values"), program.typeDefinitions);
    assert.equal(arms?.length === 3 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "float64"), true,
      "the neighboring exact floating value retains all approved native arms");
  });
}
