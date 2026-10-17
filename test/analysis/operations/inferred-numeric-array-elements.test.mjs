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

const destinationBodies = {
  alias: (element, name) => `type ${name}Values = ${element}[];
    export function ${name}(narrow: float32, signed: int32): ${name}Values {
      const values: ${name}Values = [narrow, signed]; return values; }`,
  argument: (element, name) => `function ${name}Accept(values: ${element}[]): ${element}[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept(values); }`,
  return: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const values = [narrow, signed]; const alias = values; return alias; }`,
  async: (element, name) => `export async function ${name}(narrow: float32, signed: int32): Promise<${element}[]> {
    const values = [narrow, signed]; return values; }`,
  concise: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make = (): ${element}[] => [narrow, signed]; return make(); }`,
  nested: (element, name) => `function ${name}Call(make: () => ${element}[]): ${element}[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call(() => { const values = [narrow, signed]; return values; }); }`,
  "explicit generic argument": (element, name) => `function ${name}Accept<T>(values: T[]): T[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept<${element}>(values); }`,
  "explicit generic callback": (element, name) => `function ${name}Call<T>(make: () => T[]): T[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call<${element}>(() => { const values = [narrow, signed]; return values; }); }`,
  "native generic receiver": (element, name) => `class ${name}Receiver<T> { accept(values: T[]): T[] { return values; } }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const receiver = new ${name}Receiver<${element}>(); const values = [narrow, signed]; return receiver.accept(values); }`,
  "typed callback": (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make: () => ${element}[] = () => { const values = [narrow, signed]; return values; }; return make(); }`,
};

function actualDestinationEvidence(program, expected, label) {
  const nodes = [];
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsArrayLiteralExpression(node)) nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(nodes.length, expected.length, `${label}: every actual construction is checked`);
  for (const [index, node] of nodes.entries()) {
    const kind = expected[index];
    const read = program.records.valueRead.get(node);
    const physical = getCsharpArrayLiteralElementTargetType(read?.value);
    assert.equal(physical?.kind === "source-primitive" && physical.name === kind, true,
      `${label}/${kind}: the array's own inferred physical storage is the actual destination`);
    const constructed = program.records.nativeUse.expression(node)?.use;
    assert.equal(constructed?.kind === "constructed" &&
      getCsharpArrayLiteralElementTargetType(constructed.carrier)?.name === kind, true,
    `${label}/${kind}: one actual native construction, not an end-only array conversion or copy`);
    const signed = ast.elements(node)[1];
    const use = signed === undefined ? undefined : program.records.nativeUse.expression(signed)?.use;
    assert.equal(use?.kind === "converted" && use.input.kind === "value" && use.input.type.kind === "source-primitive" &&
      use.input.type.name === "int32" && use.target.kind === "source-primitive" && use.target.name === kind &&
      use.completion.kind === "value" && use.completion.type.kind === "source-primitive" && use.completion.type.name === kind,
    true, `${label}/${kind}: the actual i32 element conversion is selected at construction`);
  }
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
        const computed = [narrow, 0.5 as float64]; const integerPastSingle = [narrow, 16777217];
        return narrowSigned[0] + narrowUnsigned[1] + signedNarrow[1] + unsignedNarrow[0] + half[1] +
          quarter[0] + halfReverse[0] + decimal[1] + decimalReverse[0] + computed[1] + integerPastSingle[1];
      }
      export function explicit(narrow: float32, signed: int32): number {
        const actualDouble: number[] = [narrow, signed]; const actualSingle: float32[] = [narrow, signed];
        return actualDouble[1] + actualSingle[1];
      }`));
    const carriers = arrays(program);
    for (const name of ["narrowSigned", "narrowUnsigned", "signedNarrow", "unsignedNarrow", "half", "quarter", "halfReverse", "actualSingle"]) assert.equal(
      carriers.get(name)?.kind === "source-primitive" && carriers.get(name)?.name === "float32", true,
      `${name}: exact inference or actual authored native float32 storage`);
    for (const name of ["decimal", "decimalReverse", "computed", "integerPastSingle", "actualDouble"]) assert.equal(
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
      const signed: int32 = 1; const wide: int64 = 9007199254740993n; const narrow: float32 = 0.5;
      export const genuine = [signed, wide]; export const floatWide = [narrow, wide];
      export const sameWide = [wide, wide]; export const fittingWide = [wide, 1];
      export const exactWideLiteral = [wide, 9007199254740993];`));
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
    const floatWide = getCsharpRuntimeUnionArms(carriers.get("floatWide"), program.typeDefinitions);
    assert.equal(floatWide?.length === 2 && ["float32", "int64"].every(kind => floatWide.some(arm =>
      arm.kind === "source-primitive" && arm.name === kind)), true, "a genuine checked float/wide union is not cut by inferred exactness");
    for (const name of ["fittingWide", "exactWideLiteral"]) assert.equal(carriers.get(name)?.kind === "source-primitive" &&
      carriers.get(name)?.name === "int64", true, `${name}: an exact authored integer fits native wide storage without a floating detour`);
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
  for (const [name, body] of Object.entries(destinationBodies)) test(`${surface} actual ${name} destination changes physical i32 element storage`, () => {
    const program = accepted(compile(surface, body("float32", "runSingle") + body("number", "runDouble")));
    actualDestinationEvidence(program, ["float32", "float64"], name);
  });
  for (const [name, body] of [
    ["generic argument", `function accept<T>(values: T[]): T[] { return values; }
      export function run(narrow: float32, signed: int32) { return accept([narrow, signed]); }`],
    ["generic callback", `function call<T>(make: () => T[]): T[] { return make(); }
      export function run(narrow: float32, signed: int32) {
        return call(() => { const values = [narrow, signed]; return values; }); }`],
  ]) test(`${surface} a self-inferred ${name} is not an authored rounding destination`, () => {
    const compiled = compile(surface, body);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.targetDiagnostics[0];
    const ast = compiled.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion." &&
      text === "[narrow, signed]", true, "checked generic inference cannot round an actual i32 through a manufactured f64 destination");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "the actual inferred construction is refused before sealing and emission");
  });
  test(`${surface} incompatible actual native destinations refuse one physical array before sealing`, () => {
    const compiled = compile(surface, `function single(values: float32[]): void {}
      function double(values: number[]): void {}
      export function run(narrow: float32, signed: int32): void {
        const values = [narrow, signed]; single(values); double(values); }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.targetDiagnostics[0];
    const ast = compiled.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "Array construction requires one consistent actual native element destination across its storage and uses." &&
      text === "[narrow, signed]", true, "no use-order winner, array copy or consumer-side storage repair hides conflicting native destinations");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "one physical construction is either closed or precisely refused before publication");
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
  for (const [name, elements] of [
    ["single fixed peer", "signed, 9007199254740993"],
    ["single fixed peer reversed", "9007199254740993, signed"],
    ["negative token", "signed, -9007199254740993"],
    ["fraction cannot conceal inexact integer", "signed, unsigned, 9007199254740993, 0.5"],
    ["unmaterialized integral token", "signed, 1e100"],
    ["unmaterialized token cannot erase incompatible peers", "signed, unsigned, 1e100"],
    ["absence cannot conceal an inexact canonical integer", "signed, undefined, 9007199254740993"],
    ["nonnumeric arms cannot conceal an inexact canonical integer", 'signed, "text", 9007199254740993'],
  ]) test(`${surface} every inferred union fallback proves exact canonical integers (${name})`, () => {
    const compiled = compile(surface, `export function run(signed: int32, unsigned: uint32) { const values = [${elements}]; return values; }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issues = compiled.targetDiagnostics;
    const issue = issues[0];
    const ast = compiled.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(issues.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "An inferred numeric union requires an exact canonical carrier for every authored integer literal." &&
      text === `[${elements}]`, true, "one exact diagnostic identifies the actual array construction, never a compiler invariant");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "a refused physical union has no sealed program or generated artifacts");
  });
  test(`${surface} exact integers beyond2^53 and bounded materialization retain actual native representations`, () => {
    const program = accepted(compile(surface, `export function run(signed: int32, unsigned: uint32) {
      const exact = [signed, 9007199254740994];
      const huge = [signed, unsigned, 1606938044258990275541962092341162602522202993782792835301376];
      const rounded: number[] = [signed, 9007199254740993];
      return exact[0] === signed && huge[0] === signed && rounded[0] === signed; }`));
    const selected = arrays(program);
    assert.equal(selected.get("exact")?.name === "float64" && selected.get("rounded")?.name === "float64", true,
      "inferred exact f64 and explicitly rounded f64 remain distinct admitted contracts");
    const arms = getCsharpRuntimeUnionArms(selected.get("huge"), program.typeDefinitions);
    assert.equal(arms?.length === 3 && ["int32", "uint32", "float64"].every(kind => arms.some(arm => arm.name === kind)), true,
      "the exact2^200 token is a flexible canonical arm, not an inferred reason to erase native integer peers");
  });
}
