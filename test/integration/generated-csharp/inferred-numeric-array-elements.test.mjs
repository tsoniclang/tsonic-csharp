import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

const sourceText = `
import type { float32, float64, int16, uint16, int32, uint32, int64 } from "@tsonic/core/types.js";
export function bare(signed: int32, unsigned: uint32) { const bareValues = [signed, unsigned]; return bareValues; }
export function reverse(signed: int32, unsigned: uint32) { const reverseValues = [unsigned, signed]; return reverseValues; }
export function left(signed: int32, unsigned: uint32) { const leftValues = [signed, unsigned, 1]; return leftValues; }
export function middle(signed: int32, unsigned: uint32) { const middleValues = [signed, 1, unsigned]; return middleValues; }
export function right(signed: int32, unsigned: uint32) { const rightValues = [1, signed, unsigned]; return rightValues; }
export function wrapped(signed: int32, unsigned: uint32) { const wrappedValues = [signed, unsigned, ((1))]; return wrappedValues; }
export function reads(signed: int32, unsigned: uint32): boolean {
  const first = bare(signed, unsigned); const second = reverse(signed, unsigned);
  const a = left(signed, unsigned); const b = middle(signed, unsigned); const c = right(signed, unsigned);
  return first[0] === signed && first[1] === unsigned && second[0] === unsigned && second[1] === signed &&
    a[0] === signed && a[1] === unsigned && a[2] === 1 && b[0] === signed && b[1] === 1 && b[2] === unsigned &&
    c[0] === 1 && c[1] === signed && c[2] === unsigned;
}
export function same(signed: int32, unsigned: uint32): boolean {
  const values = left(signed, unsigned);
  return values[0] === values[1] && values[0] === values[2] && values[1] === values[2] && !(values[0] !== values[1]);
}
export function half(narrow: float32) { return [narrow, 0.5]; }
export function decimal(narrow: float32) { return [narrow, 0.1]; }
export function small(narrow: float32, signed: int16, unsigned: uint16) { return [narrow, signed, unsigned]; }
export function explicitDouble(narrow: float32, signed: int32): number[] { return [narrow, signed]; }
export function explicitSingle(narrow: float32, signed: int32): float32[] { return [narrow, signed]; }
export function wide() { const value: int64 = 9007199254740993n; return [value, value]; }
let trace: int32 = 0;
function signedEffect(): int32 { trace = trace * 10 + 1; return -1; }
function unsignedEffect(): uint32 { trace = trace * 10 + 2; return 4294967295; }
function fractionEffect(): float64 { trace = trace * 10 + 3; return 0.5; }
export function effects(): boolean {
  trace = 0; const values = [signedEffect(), unsignedEffect(), fractionEffect()];
  return trace === 123 && values[0] === -1 && values[1] === 4294967295 && values[2] === 0.5;
}
`;

function carriers(program) {
  const result = new Map();
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) {
      const initializer = ast.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) result.set(ast.text(ast.name(node)),
        getCsharpArrayLiteralElementTargetType(program.records.valueRead.get(initializer)?.value));
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  return result;
}

for (const surface of ["native", "js"]) test(`${surface} inferred numeric arrays preserve values, physical arms, rounding boundaries and native costs`,
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const selected = carriers(compiled.result.program);
    const arms = name => {
      const result = getCsharpRuntimeUnionArms(selected.get(name), compiled.result.program.typeDefinitions);
      assert.equal(result !== undefined && result.every(arm => arm.kind === "source-primitive" &&
        ["int32", "uint32", "float64"].includes(arm.name)), true, `${name}: exact native primitive physical arms`);
      return result;
    };
    const types = { int32: "int", uint32: "uint", float64: "double" };
    const methods = [
      ["bare", "bareValues", ["int32", "uint32"]],
      ["reverse", "reverseValues", ["uint32", "int32"]],
      ["left", "leftValues", ["int32", "uint32", "float64"]],
      ["middle", "middleValues", ["int32", "float64", "uint32"]],
      ["right", "rightValues", ["float64", "int32", "uint32"]],
      ["wrapped", "wrappedValues", ["int32", "uint32", "float64"]],
    ].map(([method, name, values]) => {
      const members = arms(name);
      assert.equal(members.length === values.length && new Set(members.map(arm => arm.name)).size === values.length, true,
        `${name}: the actual constructor uses the required complete physical union`);
      const union = `Tsonic.CSharp.Runtime.Union<${members.map(arm => types[arm.name]).join(", ")}>`;
      const entries = values.map(kind => `${union}.From${members.findIndex(arm => arm.name === kind) + 1}(${kind === "int32" ? "signed" : kind === "uint32" ? "unsigned" : "1D"})`);
      const storage = surface === "native" ? `${union}[]` : `Tsonic.CSharp.Js.JSArray<${union}>`;
      const construction = surface === "native" ? `new ${union}[] { ${entries.join(", ")} }`
        : `Tsonic.CSharp.Js.JSArray<${union}>.of([${entries.join(", ")}])`;
      const reads = values.map((kind, index) => `!${method}[${index}].Is${members.findIndex(arm => arm.name === kind) + 1}() ||
        ${method}[${index}].As${members.findIndex(arm => arm.name === kind) + 1}() != ${kind === "int32" ? "-1" : kind === "uint32" ? "4294967295U" : "1D"}`).join(" || ");
      return { method, baseline: `static ${storage} Baseline_${method}(int signed, uint unsigned) => ${construction};`,
        read: `var ${method} = Subject.${method}(-1, 4294967295U); if (${reads}) throw new System.Exception("${method}: exact physical contribution");` };
    });
    const nativeProgram = `
using Subject = Tsonic.Generated.Index;
${methods.map(method => method.baseline).join("\n")}
${methods.map(method => method.read).join("\n")}
if (!Subject.reads(-1, 4294967295U) || !Subject.same(1, 1) || Subject.same(-1, 4294967295U) || !Subject.effects())
    throw new System.Exception("source indexed reads, cross-arm equality or once-only order");
var half = Subject.half(-0F);
if (System.BitConverter.SingleToUInt32Bits(half[0]) != 0x80000000U || half[1] != 0.5F)
    throw new System.Exception("float32 signed zero or exact binary token");
var decimalValues = Subject.@decimal(1.5F);
if (System.BitConverter.DoubleToUInt64Bits(decimalValues[1]) != System.BitConverter.DoubleToUInt64Bits(0.1D))
    throw new System.Exception("the actual float64 fraction was rounded through float32");
var small = Subject.small(1.5F, short.MinValue, ushort.MaxValue);
if (small[0] != 1.5F || small[1] != short.MinValue || small[2] != ushort.MaxValue)
    throw new System.Exception("a narrow integer domain lost an exact native value");
var doubles = Subject.explicitDouble(1.5F, 16777217);
var singles = Subject.explicitSingle(1.5F, 16777217);
if (doubles[1] != 16777217D || singles[1] != (float)16777217 || Subject.wide()[0] != 9007199254740993L)
    throw new System.Exception("actual native destination or exact int64 contract changed");
for (int index = 0; index < 512; index++) {
${methods.map(({ method }) => `System.GC.KeepAlive(Subject.${method}(-1, 4294967295U)); System.GC.KeepAlive(Baseline_${method}(-1, 4294967295U));`).join("\n")}
}
${methods.map(({ method }) => `
long before_${method} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Subject.${method}(-1, 4294967295U));
long generated_${method} = System.GC.GetAllocatedBytesForCurrentThread() - before_${method};
before_${method} = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) System.GC.KeepAlive(Baseline_${method}(-1, 4294967295U));
long native_${method} = System.GC.GetAllocatedBytesForCurrentThread() - before_${method};
if (generated_${method} != native_${method}) throw new System.Exception($"${method}: native allocation mismatch {generated_${method}}/{native_${method}}");
System.Console.WriteLine($"${method}: generated={generated_${method}} native={native_${method}}");`).join("\n")}
long counterBefore = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 1000; index++) { System.GC.KeepAlive(Baseline_bare(-1, 4294967295U)); System.GC.KeepAlive(new object()); }
long counterBytes = System.GC.GetAllocatedBytesForCurrentThread() - counterBefore;
if (counterBytes <= native_bare) throw new System.Exception("the native allocation counter did not detect a real extra object");
System.Console.WriteLine("numeric arrays: exact native values and costs");`;
    const root = new URL(`../../../.temp/C01-inferred-numeric-array-elements/${surface}/`, import.meta.url);
    mkdirSync(root, { recursive: true });
    writeFileSync(new URL("source-and-native.json", root), JSON.stringify({ sourceText, nativeProgram, artifacts: [...compiled.artifacts] }, null, 2));
    const output = executeCsharpConstruction(compiled, `C01-inferred-numeric-${surface}`, false, false, [], nativeProgram);
    writeFileSync(new URL("native-output.txt", root), output);
    assert.equal(output.trim().endsWith("numeric arrays: exact native values and costs"), true,
      "the actual generated program passed every native value, tag, sign, order and exact allocation control");
  });

const physicalForms = [
  ["bare", "[signed, unsigned]", 2],
  ["literalLast", "[signed, unsigned, 1]", 3],
  ["literalMiddle", "[signed, 1, unsigned]", 3],
  ["literalFirst", "[1, signed, unsigned]", 3],
];
const operationControls = [
  ["number read", "const value: number = values[0]; return value === 1;", ["values[0]"]],
  ["order", "return !(values[0] < values[1]);", ["values[0] < values[1]"]],
  ["addition", "return values[0] + values[1] === 2;", ["values[0] + values[1]"]],
  ["Object.is", "return Object.is(values[0], values[1]);", ["Object.is(values[0], values[1])"]],
  ["Math.max", "return Math.max(values[0], values[1]) === 1;", ["Math.max(values[0], values[1])"]],
  ["includes", "const first = [values[0]]; return first.includes(values[1]);", ["first.includes(values[1])"]],
  ["indexOf", "return values.indexOf(values[1]) === 0;", ["values.indexOf(values[1])"]],
  ["Set", "const keys = new Set(values); return keys.has(values[1]) && keys.size === 1;", ["new Set(values)", "keys.has(values[1])"]],
  ["Map", "const keys = new Map<number, boolean>(); keys.set(values[0], true); return keys.has(values[1]);",
    ["keys.set(values[0], true)", "keys.has(values[1])"]],
  ["String", 'return String(values[0]) === "1" && String(values[1]) === "1";', ["String(values[0])", "String(values[1])"]],
  ["template", 'return `${values[0]}:${values[1]}` === "1:1";', ["values[0]", "values[1]"]],
  ["JSON", "return JSON.stringify(values) === EXPECTED_JSON;", ["JSON.stringify(values)"]],
  ["sort", "values.sort(); return JSON.stringify(values) === EXPECTED_SORT;", ["values.sort()", "JSON.stringify(values)"]],
];
const refusalCodes = new Set([
  "CSHARP_UNSUPPORTED_AST", "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED", "CSHARP_JS_SOURCE_PROFILE_ELEMENT_NOT_CLOSED",
  "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", "CSHARP_JS_COLLECTION_CONSTRUCTION_NOT_CLOSED",
  "CSHARP_CALL_ARGUMENT_CONVERSION_NOT_PROVEN", "CSHARP_ELEMENT_READ_CONVERSION_NOT_PROVEN",
  "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN",
]);

for (const [formName, form, size] of physicalForms) for (const [operation, body, anchors] of operationControls) {
  test(`C130 js: ${formName} ${operation} uses native number semantics or a precise pre-seal refusal`,
    { timeout: 300_000 }, () => {
      const expectedJson = size === 2 ? "[1,1]" : "[1,1,1]";
      const expectedSort = size === 2 ? "[10,2]" : "[1,10,2]";
      const sourceText = 'import type { int32, uint32 } from "@tsonic/core/types.js";\n' +
        `export function check(signed: int32, unsigned: uint32): boolean { const values = ${form}; ` +
        body.replace("EXPECTED_JSON", JSON.stringify(expectedJson)).replace("EXPECTED_SORT", JSON.stringify(expectedSort)) + " }";
      const compiled = compileCsharpSource({ surface: "js", sourceText });
      assert.equal(compiled.sourceDiagnosticsText === "", true, `${operation}: ${compiled.sourceDiagnosticsText}`);
      const errors = compiled.targetDiagnostics.filter(issue => issue.category === "error");
      const root = new URL(`../../../.temp/C01-inferred-numeric-array-elements/operations/${formName}/${operation.replace(/[^a-z]/giu, "-")}/`, import.meta.url);
      mkdirSync(root, { recursive: true });
      const diagnostic = issue => {
        const ast = compiled.source.ast;
        const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
        const text = range?.kind !== "authored" ? undefined
          : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
        return { code: issue.code, message: issue.message, text };
      };
      writeFileSync(new URL("source-and-result.json", root), JSON.stringify({ sourceText,
        diagnostics: errors.map(diagnostic), artifacts: [...compiled.artifacts] }, null, 2));
      if (errors.length > 0) {
        assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
          "an unsupported cross-arm operation is refused before the seal and emits no artifact");
        for (const issue of errors) {
          const observed = diagnostic(issue);
          assert.equal(refusalCodes.has(issue.code), true, `${operation}: an exact existing source owner (${issue.code}: ${issue.message})`);
          assert.equal(issue.message.length > 0 && !/missing|not finalized|internal invariant|unresolved|requires.*(?:sealed|completed).*evidence/iu.test(issue.message), true,
            `${operation}: a precise operation refusal, never an internal missing-evidence failure`);
          assert.equal(observed.text !== undefined && observed.text.trim().length > 0 &&
            anchors.some(anchor => observed.text.includes(anchor) || anchor.includes(observed.text)), true,
          `${operation}: the refusal identifies the actual unsupported authored operation or its operand`);
        }
        process.stdout.write(`C130 ${formName} ${operation}: PRESEAL ${errors.map(issue => issue.code).join(",")}\n`);
        return;
      }
      assertCsharpCompilationSucceeded(compiled);
      const nativeProgram = `if (!Tsonic.Generated.Index.check(${operation === "sort" ? "10, 2" : "1, 1"}))
        throw new System.Exception("C130 ${formName} ${operation}: cross-arm number semantics");
        System.Console.WriteLine("C130 native operation passed");`;
      writeFileSync(new URL("native-program.cs", root), nativeProgram);
      const output = executeCsharpConstruction(compiled, `C130-${formName}-${operation.replace(/[^a-z]/giu, "-")}`, false, false, [], nativeProgram);
      writeFileSync(new URL("native-output.txt", root), output);
      assert.equal(output.includes("C130 native operation passed"), true, "the real generated native operation observes exact cross-arm number semantics");
      process.stdout.write(`C130 ${formName} ${operation}: NATIVE\n`);
    });
}
