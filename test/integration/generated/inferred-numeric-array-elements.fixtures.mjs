import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpEnumerableTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { combineCsharpTargetUnionMembers } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { isCsharpStringTargetType, isCsharpJsStringTargetType } from "../../../dist/target-model/types/identity.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const destinationBodies = {
  Alias: (element, name) => `type ${name}Values = ${element}[];
    export function ${name}(narrow: float32, signed: int32): ${name}Values {
      const values: ${name}Values = [narrow, signed]; return values; }`,
  Argument: (element, name) => `function ${name}Accept(values: ${element}[]): ${element}[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept(values); }`,
  Return: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const values = [narrow, signed]; const alias = values; return alias; }`,
  Async: (element, name) => `export async function ${name}(narrow: float32, signed: int32): Promise<${element}[]> {
    const values = [narrow, signed]; return values; }`,
  Concise: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make = (): ${element}[] => [narrow, signed]; return make(); }`,
  Nested: (element, name) => `function ${name}Call(make: () => ${element}[]): ${element}[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call(() => { const values = [narrow, signed]; return values; }); }`,
  GenericArgument: (element, name) => `function ${name}Accept<T>(values: T[]): T[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept<${element}>(values); }`,
  GenericCallback: (element, name) => `function ${name}Call<T>(make: () => T[]): T[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call<${element}>(() => { const values = [narrow, signed]; return values; }); }`,
  Receiver: (element, name) => `class ${name}Receiver<T> { accept(values: T[]): T[] { return values; } }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const receiver = new ${name}Receiver<${element}>(); const values = [narrow, signed]; return receiver.accept(values); }`,
  TypedCallback: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make: () => ${element}[] = () => { const values = [narrow, signed]; return values; }; return make(); }`,
};

const destinationPrograms = Object.entries(destinationBodies).flatMap(([context, body]) =>
  [["Single", "float32", "float"], ["Double", "number", "double"]].map(([suffix, element, native]) => ({
    context, name: `destination${context}${suffix}`, native,
    source: body(element, `destination${context}${suffix}`),
  })));

const unionDestinationPrograms = Object.entries(destinationBodies).map(([context, body]) => ({
  context, name: `unionDestination${context}`,
  source: body("(string | number)", `unionDestination${context}`).replaceAll("[narrow, signed]",
    '["text", 9007199254740993, -9007199254740993, 1e100]'),
}));

unionDestinationPrograms.push(
  { context: "NestedGenericArgument", name: "unionNestedGenericArgument", source: `
    function unionNestedAccept<T>(values: (string | T)[]): (string | T)[] { return values; }
    export function unionNestedGenericArgument(narrow: float32, signed: int32): (string | number)[] {
      const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return unionNestedAccept<number>(values); }` },
  { context: "NestedGenericCallback", name: "unionNestedGenericCallback", source: `
    function unionNestedCall<T>(make: () => (string | T)[]): (string | T)[] { return make(); }
    export function unionNestedGenericCallback(narrow: float32, signed: int32): (string | number)[] {
      return unionNestedCall<number>(() => { const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return values; }); }` },
  { context: "NestedGenericReceiver", name: "unionNestedGenericReceiver", source: `
    class UnionNestedReceiver<T> { accept(values: (string | T)[]): (string | T)[] { return values; } }
    export function unionNestedGenericReceiver(narrow: float32, signed: int32): (string | number)[] {
      const receiver = new UnionNestedReceiver<number>();
      const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return receiver.accept(values); }` },
);

const sourceText = `
import type { float32, float64, int16, uint16, int32, uint32, int64, decimal as nativeDecimal } from "@tsonic/core/types.js";
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
export function fittingWide() { const value: int64 = 9007199254740993n; return [value, 1, 9007199254740993]; }
export function integerPastSingle(narrow: float32) { return [narrow, 16777217]; }
export function exactHuge(signed: int32, unsigned: uint32) {
  const hugeValues = [signed, unsigned, 1606938044258990275541962092341162602522202993782792835301376]; return hugeValues;
}
export function explicitRounded(signed: int32): number[] { return [signed, 9007199254740993]; }
export function genuineFloatWide(narrow: float32, wide: int64) {
  const floatWideValues = [narrow, wide]; return floatWideValues;
}
export function explicitUnionWide(wide: int64): (string | int64)[] {
  const exactUnionValues: (string | int64)[] = ["text", wide, 9007199254740993n]; return exactUnionValues;
}
export function explicitUnionDecimal(): (string | nativeDecimal)[] {
  const decimalUnionValues: (string | nativeDecimal)[] = ["text", 9007199254740993]; return decimalUnionValues;
}
export function explicitUnionSingle(): (string | float32)[] {
  const singleUnionValues: (string | float32)[] = ["text", 16777217]; return singleUnionValues;
}
export function explicitOptionalDouble(): (number | undefined)[] {
  const optionalUnionValues: (number | undefined)[] = [undefined, 9007199254740993]; return optionalUnionValues;
}
export function explicitWideFloatUnion(wide: int64, computed: number): (int64 | number)[] {
  const wideFloatUnionValues: (int64 | number)[] = [wide, computed]; return wideFloatUnionValues;
}
export function inferredHeterogeneous(computed: number) {
  const inferredHeterogeneousValues = ["text", computed, 9007199254740994, 0.1, -0]; return inferredHeterogeneousValues;
}
let trace: int32 = 0;
function signedEffect(): int32 { trace = trace * 10 + 1; return -1; }
function unsignedEffect(): uint32 { trace = trace * 10 + 2; return 4294967295; }
function fractionEffect(): float64 { trace = trace * 10 + 3; return 0.5; }
export function effects(): boolean {
  trace = 0; const values = [signedEffect(), unsignedEffect(), fractionEffect()];
  return trace === 123 && values[0] === -1 && values[1] === 4294967295 && values[2] === 0.5;
}
` + destinationPrograms.map(program => program.source).join("\n") + "\n" +
  unionDestinationPrograms.map(program => program.source).join("\n");

let supportedSourceText = sourceText
  .replace("export function integerPastSingle(narrow: float32) {", "export function integerPastSingle(narrow: float32): number[] {")
  .replace("const hugeValues = [", "const hugeValues: (int32 | uint32 | number)[] = [");
for (const program of destinationPrograms) if (["Argument", "GenericArgument", "Receiver"].includes(program.context)) {
  supportedSourceText = supportedSourceText.replace(program.source,
    program.source.replace("const values = [", `const values: ${program.native === "float" ? "float32" : "number"}[] = [`));
}
for (const program of unionDestinationPrograms) if (["Argument", "GenericArgument", "Receiver",
  "NestedGenericArgument", "NestedGenericReceiver"].includes(program.context)) {
  supportedSourceText = supportedSourceText.replace(program.source,
    program.source.replace("const values = [", "const values: (string | number)[] = ["));
}
supportedSourceText += `
export function writtenNegativeZero() { return -0.0; }
export function declaredNegativeZero(): number { return -0; }
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
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  return result;
}

function nativeArrayElements(program) {
  const named = new Map();
  const unionDestinations = [];
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsArrayLiteralExpression(node)) {
      const use = program.records.nativeExpression.get(node)?.use;
      assert.equal(use?.kind === "constructed", true, "every native array has one admitted physical construction");
      const element = getCsharpArrayLiteralElementTargetType(use.carrier);
      if (ast.elements(node).length === 4 && ast.is.IsStringLiteral(ast.elements(node)[0])) unionDestinations.push(element);
      const parent = ast.parent(node);
      if (parent !== undefined && ast.is.IsVariableDeclaration(parent)) named.set(ast.text(ast.name(parent)), element);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  return { named, unionDestinations };
}

const physicalForms = [
  ["bare", "[signed, unsigned]", 2],
  ["literalLast", "[signed, unsigned, 1]", 3],
  ["literalMiddle", "[signed, 1, unsigned]", 3],
  ["literalFirst", "[1, signed, unsigned]", 3],
];

const operationControls = [
  ["number read", "const value: number = values[0]; return value === 1;"],
  ["order", "return !(values[0] < values[1]);"],
  ["addition", "return values[0] + values[1] === 2;"],
  ["equality", "return values[0] === values[1] && !(values[0] !== values[1]);"],
  ["Object.is", "return Object.is(values[0], values[1]);"],
  ["Math.max", "return Math.max(values[0], values[1]) === 1;"],
  ["includes", "const first = [values[0]]; return first.includes(values[1]);"],
  ["indexOf", "return values.indexOf(values[1]) === 0;"],
  ["lastIndexOf", "return values.lastIndexOf(values[1]) === values.length - 1;"],
  ["Set", "const keys = new Set(values); return keys.has(values[1]) && keys.size === 1;"],
  ["Map", "const keys = new Map<number, boolean>(); keys.set(values[0], true); return keys.has(values[1]);"],
  ["String", 'return String(values[0]) === "1" && String(values[1]) === "1";'],
  ["template", 'return `${values[0]}:${values[1]}` === "1:1";'],
  ["JSON", "return JSON.stringify(values) === EXPECTED_JSON;"],
  ["sort", "values.sort(); return JSON.stringify(values) === EXPECTED_SORT;"],
];

function expectedOperationRefusals(operation, size) {
  const primitive = csharpSourcePrimitiveTargetType;
  const union = combineCsharpTargetUnionMembers([primitive("int32"), primitive("uint32"),
    ...(size === 3 ? [primitive("int64")] : [])]);
  const refused = (message, text, code = "CSHARP_UNSUPPORTED_AST") => ({ code, message, text });
  const conversion = (text, source = union, target = primitive("float64")) => refused(
    `No exact C# implicit conversion relates '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}'.`, text);
  switch (operation) {
    case "number read": return [conversion("values[0]")];
    case "order": return [refused("C# relational operator '<' requires numeric source-primitive operands or two exact string operands.",
      "values[0] < values[1]")];
    case "addition": return [refused("C# arithmetic operator '+' requires numeric source-primitive operands.",
      "values[0] + values[1]")];
    case "Math.max": return [conversion("values[0]"), conversion("values[1]")];
    case "includes": return [refused("Array.includes over a numeric union requires an exact native cross-arm key equality relation.",
      "first.includes(values[1])", "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED")];
    case "indexOf": return [refused("Array.indexOf over a numeric union requires an exact native cross-arm key equality relation.",
      "values.indexOf(values[1])", "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED")];
    case "lastIndexOf": return [refused("Array.lastIndexOf over a numeric union requires an exact native cross-arm key equality relation.",
      "values.lastIndexOf(values[1])", "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED")];
    case "Set": return [conversion("values", csharpJsArrayTargetType(union), csharpEnumerableTargetType(primitive("float64"))),
      conversion("values[1]")];
    case "Map": return [conversion("values[0]"), conversion("values[1]")];
    case "equality": case "Object.is": case "String": case "template": case "JSON": case "sort": return [];
    default: throw new Error(`No declared C130 operation contract for ${operation}.`);
  }
}

export { destinationBodies, destinationPrograms, unionDestinationPrograms, sourceText, supportedSourceText, carriers, nativeArrayElements, physicalForms, operationControls, expectedOperationRefusals };
