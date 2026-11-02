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
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpDeclarations, reconcileInferredReturnTargetContract } from "../../../dist/analysis/declarations/analyze.js";
import { csharpRuntimeUnionTargetType, csharpTargetNamedType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpNumericReturnBaselineCovered } from "../../../dist/policy/conversions/union-relations.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { combineCsharpTargetUnionMembers } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { header, emptyProviders, compile, diagnosticLabel, accepted, arrays, constructedArrays, destinationBodies, actualDestinationEvidence, actualUnionDestinationEvidence,
  numericRangeReason, numericCommonReason, refused, arrayRefusal, contextualSource, laterArgumentContexts, arrayConversionRefusal, inferredTextUnion, declaredTextUnion } from "./inferred-numeric-array-elements.fixtures.mjs";

for (const surface of ["native", "js"]){
test(`${surface} an actual generic union argument selects the literal's physical storage order`, () => {
    const originalSource = `function consume<T>(values: (string | T)[]): void {}
      export function run(): number {
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; consume<number>(values); return 7;
      }`;
    refused(compile(surface, originalSource), [arrayRefusal(
      "An inferred numeric union requires an exact canonical carrier for every authored integer literal.",
      '["text", 9007199254740993, -9007199254740993, 1e100]')]);
    const program = accepted(compile(surface, contextualSource(originalSource, "(string | number)")));
    const ast = program.source.ast;
    let call;
    let array;
    const visit = node => {
      if (ast.is.IsArrayLiteralExpression(node)) array = node;
      if (ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node)?.Expression) === "consume") call = node;
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    assert.equal(call !== undefined && array !== undefined, true, "the actual call and source construction remain present");
    const grouping = program.records.selectedCall.get(call)?.sourceArgumentGrouping;
    const constructed = program.records.nativeExpression.get(array)?.use;
    assert.equal(grouping?.kind === "grouped" && grouping.arguments.length === 1 && constructed?.kind === "constructed" &&
      targetTypeRefKey(constructed.carrier) === targetTypeRefKey(grouping.arguments[0].type), true,
    "literal storage is the exact selected native array parameter, not a sorted peer requiring an array conversion or copy");
  });

for (const [name, source] of [
    ["nested generic argument", `function accept<T>(values: (string | T)[]): (string | T)[] { return values; }
      export function run(): (string | number)[] { const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return accept<number>(values); }`],
    ["nested generic callback", `function call<T>(make: () => (string | T)[]): (string | T)[] { return make(); }
      export function run(): (string | number)[] { return call<number>(() => {
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return values; }); }`],
    ["nested generic receiver", `class Receiver<T> { accept(values: (string | T)[]): (string | T)[] { return values; } }
      export function run(): (string | number)[] { const receiver = new Receiver<number>();
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return receiver.accept(values); }`],
  ]){
test(`${surface} actual ${name} union bindings are authoritative native destinations`, () => {
    refused(compile(surface, source), [arrayRefusal(
      "An inferred numeric union requires an exact canonical carrier for every authored integer literal.",
      '["text", 9007199254740993, -9007199254740993, 1e100]')]);
    actualUnionDestinationEvidence(accepted(compile(surface, contextualSource(source, "(string | number)"))), name);
  });
}

test(`${surface} explicit heterogeneous and nullable native destinations retain their real selected widths`, () => {
    const program = accepted(compile(surface, `
      import type { decimal } from "@tsonic/core/types.js";
      export function exact(wide: int64): (string | int64)[] {
        const values: (string | int64)[] = ["text", wide, 9007199254740993n]; return values; }
      export function optional(): (number | undefined)[] {
        const optionalValues: (number | undefined)[] = [undefined, 9007199254740993]; return optionalValues; }
      export function decimalUnion(): (string | decimal)[] {
        const decimalValues: (string | decimal)[] = ["text", 9007199254740993]; return decimalValues; }
      export function single(): (string | float32)[] {
        const singleValues: (string | float32)[] = ["text", 16777217]; return singleValues; }
      export function mixed(wide: int64, computed: number): (int64 | number)[] {
        const mixedValues: (int64 | number)[] = [wide, computed]; return mixedValues; }`));
    const selected = constructedArrays(program);
    for (const [name, scalar] of [["values", "int64"], ["decimalValues", "decimal"], ["singleValues", "float32"]]) {
      const arms = getCsharpRuntimeUnionArms(selected.get(name), program.typeDefinitions);
      assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === scalar), true,
        `${name}: the actual authored union endpoint is retained without an artificial floating common carrier`);
    }
    const mixed = getCsharpRuntimeUnionArms(selected.get("mixedValues"), program.typeDefinitions);
    assert.equal(mixed?.length === 2 && ["int64", "float64"].every(kind => mixed.some(arm => arm.name === kind)), true,
      "an actual heterogeneous destination preserves the full native integer arm as well as a genuine computed float");
  });

test(`${surface} inferred heterogeneous counter-controls preserve exact integers, fractions, signed zero and computed values`, () => {
    const originalSource = `export function run(computed: number) {
      const exact = ["text", 9007199254740994];
      const huge = ["text", 1606938044258990275541962092341162602522202993782792835301376];
      const fraction = ["text", 0.1]; const signedZero = ["text", -0];
      const actualFloat = ["text", computed]; const absent = [undefined, 9007199254740994];
      return exact.${surface === "native" ? "Length" : "length"} + huge.${surface === "native" ? "Length" : "length"} +
        fraction.${surface === "native" ? "Length" : "length"} + signedZero.${surface === "native" ? "Length" : "length"} +
        actualFloat.${surface === "native" ? "Length" : "length"} + absent.${surface === "native" ? "Length" : "length"}; }`;
    refused(compile(surface, originalSource), [arrayRefusal(numericRangeReason,
      '["text", 1606938044258990275541962092341162602522202993782792835301376]')]);
    const program = accepted(compile(surface, originalSource.replace("const huge = [", "const huge: (string | number)[] = [")));
    const selected = constructedArrays(program);
    for (const name of ["exact", "huge", "fraction", "signedZero", "actualFloat"]) {
      const arms = getCsharpRuntimeUnionArms(selected.get(name), program.typeDefinitions);
      const expected = name === "exact" || name === "signedZero" ? "int64" : "float64";
      assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === expected) &&
        arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
      `${name}: exact int64 and declared/written/computed floating contributions retain the existing heterogeneous native carrier`);
    }
  });

for (const [name, body] of [
    ["generic argument", `function accept<T>(values: T[]): T[] { return values; }
      export function run(narrow: float32, signed: int32) { return accept([narrow, signed]); }`],
    ["generic callback", `function call<T>(make: () => T[]): T[] { return make(); }
      export function run(narrow: float32, signed: int32) {
        return call(() => { const values = [narrow, signed]; return values; }); }`],
  ]){
test(`${surface} a self-inferred ${name} is not an authored rounding destination`, () => {
    const compiled = compile(surface, body);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion." &&
      text === "[narrow, signed]", true, `checked generic inference cannot round an actual i32 through a manufactured f64 destination; ${diagnosticLabel(compiled)}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "the actual inferred construction is refused before sealing and emission");
  });
}

for (const [name, body] of [
    ["plain generic argument", `function accept<T>(values: T[]): T[] { return values; }
      export function run() { const values = ["text", 9007199254740993]; return accept(values); }`],
    ["nested generic argument", `function accept<T>(values: (string | T)[]): (string | T)[] { return values; }
      export function run() { const values = ["text", 9007199254740993]; return accept(values); }`],
    ["nested generic callback", `function call<T>(make: () => (string | T)[]): (string | T)[] { return make(); }
      export function run() { return call(() => { const values = ["text", 9007199254740993]; return values; }); }`],
  ]){
test(`${surface} a self-inferred ${name} is not an explicit closed union destination`, () => {
    const compiled = compile(surface, body);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const program = accepted(compiled);
    const read = arrays(program).get("values");
    const constructed = constructedArrays(program).get("values");
    const arms = getCsharpRuntimeUnionArms(read, program.typeDefinitions);
    assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "int64") &&
      arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
      "the generic identity consumes the exact earlier string/int64 construction without a floating rounding destination");
    assert.equal(read !== undefined && constructed !== undefined && targetTypeRefKey(read) === targetTypeRefKey(constructed), true,
      "generic binding preserves the same original native array layout at construction and every read");
    assert.equal(/\.ToArray\(|\.Clone\(|Convert\.ToDouble|DynamicInvoke|TsValue/u.test([...compiled.artifacts.values()].join("\n")), false,
      "an inferred generic identity requires no array repair, dynamic wrapper or lossy numeric conversion");
  });
}

for (const [name, body] of [
    ["argument", `function accept<T>(sample: T, values: T[]): T[] { void sample; return values; }
      export function run(narrow: float32, signed: int32, wide: number) {
        const values = [narrow, signed]; return accept(wide, values); }`],
    ["callback", `function call<T>(sample: T, make: () => T[]): T[] { void sample; return make(); }
      export function run(narrow: float32, signed: int32, wide: number) {
        return call(wide, () => { const values = [narrow, signed]; return values; }); }`],
  ]){
test(`${surface} an independently inferred generic ${name} retains its actual native destination`, () => {
    if (name === "argument") refused(compile(surface, body), [arrayRefusal(numericCommonReason, "[narrow, signed]")]);
    const program = accepted(compile(surface, name === "argument" ? contextualSource(body, "number") : body));
    actualDestinationEvidence(program, ["float64"], `independent generic ${name}`);
  });
}

for (const [name, body] of [
    ["arguments", `function accept<T>(first: T[], second: T[]): T[] { void second; return first; }
      export function run() { const values = ["text", 9007199254740993]; const alias = values;
        return accept(values, alias); }`],
    ["callbacks", `function call<T>(first: () => T[], second: () => T[]): T[] { void second; return first(); }
      export function run() { const values = ["text", 9007199254740993];
        return call(() => values, () => values); }`],
  ]){
test(`${surface} same-call ${name} of one array cannot certify each other's rounding destination`, () => {
    const compiled = compile(surface, body);
    const program = accepted(compiled);
    const arms = getCsharpRuntimeUnionArms(arrays(program).get("values"), program.typeDefinitions);
    assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "int64") &&
      arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
    "the same-call aliases retain the earlier exact string/int64 construction and provide no floating rounding authority");
    assert.equal(/\.ToArray\(|\.Clone\(|Convert\.ToDouble/u.test([...compiled.artifacts.values()].join("\n")), false,
      "native generic alias transport does not copy or repair the array");
  });
}

test(`${surface} incompatible actual native destinations refuse one physical array before sealing`, () => {
    const compiled = compile(surface, `function single(values: float32[]): void {}
      function double(values: number[]): void {}
      export function run(narrow: float32, signed: int32): void {
        const values = [narrow, signed]; single(values); double(values); }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    const owner = issue?.sourceNode === undefined ? undefined : ast.parent(issue.sourceNode);
    const ownerRange = owner === undefined ? undefined : ast.authoredRange(owner);
    const ownerText = ownerRange?.kind !== "authored" ? undefined
      : ast.getSourceText(ast.getSourceFile(owner)).slice(ownerRange.start, ownerRange.end);
    const expected = surface === "native"
      ? "No exact C# implicit conversion relates 'array:1:source:float32' to 'array:1:source:float64'."
      : "No exact C# implicit conversion relates 'target:Tsonic.CSharp.Js.JSArray`1<source:float32>' to 'target:Tsonic.CSharp.Js.JSArray`1<source:float64>'.";
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_UNSUPPORTED_AST" &&
      issue.message === expected && text === "values" && ownerText === "double(values)", true,
      `the incompatible native use is refused without retyping the earlier literal, copying its array or repairing storage; ${diagnosticLabel(compiled)}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "one physical construction is either closed or precisely refused before publication");
  });

test(`${surface} an erased callable does not admit or reject its numeric body`, () => {
    accepted(compile(surface, `export function run(narrow: float32, signed: int32): number {
      void (() => { const values = [narrow, signed]; return values[0]; }); return 7; }`));
  });

test(`${surface} a stored callable retains numeric body admission after a discarded read`, () => {
    const compiled = compile(surface, `export function run(narrow: float32, signed: int32): number {
      const unused = () => { const values = [narrow, signed]; return values[0]; }; void unused; return 7; }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion." &&
      text === "[narrow, signed]", true, `discarding a read does not erase the stored callable's required native body; ${diagnosticLabel(compiled)}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "the stored numeric body is rejected before publication and emission");
  });

test(`${surface} an authored integer outside the canonical floating arm is refused without a native-integer cap`, () => {
    const originalSource = `export function run(signed: int32, unsigned: uint32): number {
      const values = [signed, unsigned, 9007199254740993]; return values[0]; }`;
    const compiled = compile(surface, originalSource);
    const inferred = combineCsharpTargetUnionMembers([csharpSourcePrimitiveTargetType("int32"),
      csharpSourcePrimitiveTargetType("uint32"), csharpSourcePrimitiveTargetType("int64")]);
    refused(compiled, [{ code: "CSHARP_UNSUPPORTED_AST", message:
      `No exact C# implicit conversion relates '${targetTypeRefKey(inferred)}' to 'source:float64'.`, text: "values[0]" }]);
    const declared = accepted(compile(surface, contextualSource(originalSource, "number")));
    assert.equal(arrays(declared).get("values")?.name, "float64",
      "a genuine own number[] declaration requests the native floating conversion rather than an inferred precision cap");
    const program = accepted(compile(surface, `export function run(signed: int32, unsigned: uint32) {
      const values = [signed, unsigned, 9007199254740992]; return values; }`));
    const arms = getCsharpRuntimeUnionArms(arrays(program).get("values"), program.typeDefinitions);
    assert.equal(arms?.length === 3 && ["int32", "uint32", "int64"].every(name => arms.some(arm =>
      arm.kind === "source-primitive" && arm.name === name)), true,
      "the neighboring exact integer retains all approved native arms without a floating precision cap");
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
    ["text cannot authorize a floating default", '"text", 9007199254740993'],
    ["text reversed cannot authorize a floating default", '9007199254740993, "text"'],
    ["text and a fraction cannot authorize a floating default", '"text", -9007199254740993, 0.5'],
    ["native absence cannot authorize a floating default", "undefined, 9007199254740993"],
    ["native absence reversed cannot authorize a floating default", "9007199254740993, undefined"],
    ["Boolean storage cannot authorize a floating default", "false, 1e100"],
  ]){
test(`${surface} every inferred union fallback proves exact canonical integers (${name})`, () => {
    const originalSource = `export function run(signed: int32, unsigned: uint32) { const values = [${elements}]; return values; }`;
    const floatingContext = name === "fraction cannot conceal inexact integer" || name === "text and a fraction cannot authorize a floating default";
    if (floatingContext) refused(compile(surface, originalSource), [arrayRefusal(
      "An inferred numeric union requires an exact canonical carrier for every authored integer literal.", `[${elements}]`)]);
    const compiled = compile(surface, floatingContext ? originalSource.replace("9007199254740993", "9007199254740994") : originalSource);
    const program = accepted(compiled);
    const carrier = arrays(program).get("values");
    assert.equal(carrier !== undefined, true, "the original source construction publishes its actual native element carrier");
    const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
    const arms = getCsharpRuntimeUnionArms(present, program.typeDefinitions) ?? [present];
    const expected = {
      "single fixed peer": ["int64"],
      "single fixed peer reversed": ["int64"],
      "negative token": ["int64"],
      "fraction cannot conceal inexact integer": ["float64"],
      "unmaterialized integral token": ["float64"],
      "unmaterialized token cannot erase incompatible peers": ["float64"],
      "absence cannot conceal an inexact canonical integer": ["int32", "int64"],
      "nonnumeric arms cannot conceal an inexact canonical integer": ["int32", "int64", "string"],
      "text cannot authorize a floating default": ["string", "int64"],
      "text reversed cannot authorize a floating default": ["int64", "string"],
      "text and a fraction cannot authorize a floating default": ["string", "float64"],
      "native absence cannot authorize a floating default": ["int64"],
      "native absence reversed cannot authorize a floating default": ["int64"],
      "Boolean storage cannot authorize a floating default": ["bool", "float64"],
    }[name];
    const selected = arms.map(arm => arm?.kind === "source-primitive" ? arm.name
      : isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm) ? "string" : "UNKNOWN");
    assert.deepEqual(selected.sort(), [...expected].sort(),
      "every original physical contribution has exactly its lawful native arm, without a phantom or missing payload");
    assert.equal(getCsharpNullableElementTargetType(carrier) !== undefined, elements.includes("undefined"),
      "only the original absent inputs retain the one native absence alongside their exact payloads");
    assert.equal(/\.ToArray\(|\.Clone\(|Convert\.ToDouble/u.test([...compiled.artifacts.values()].join("\n")), false,
      "admitting the original exact native integer creates no array-copy or floating repair path");
  });
}

test(`${surface} exact integers beyond2^53 and bounded materialization retain actual native representations`, () => {
    const originalSource = `export function run(signed: int32, unsigned: uint32) {
      const exact = [signed, 9007199254740994];
      const huge = [signed, unsigned, 1606938044258990275541962092341162602522202993782792835301376];
      const rounded: number[] = [signed, 9007199254740993];
      return exact[0] === signed && huge[0] === signed && rounded[0] === signed; }`;
    refused(compile(surface, originalSource), [arrayRefusal(numericRangeReason,
      "[signed, unsigned, 1606938044258990275541962092341162602522202993782792835301376]")]);
    const program = accepted(compile(surface, originalSource.replace("const huge = [", "const huge: (int32 | uint32 | number)[] = [")));
    const selected = arrays(program);
    assert.equal(selected.get("exact")?.name === "int64" && selected.get("rounded")?.name === "float64", true,
      "inferred exact int64 and explicitly rounded f64 remain distinct admitted contracts");
    const arms = getCsharpRuntimeUnionArms(selected.get("huge"), program.typeDefinitions);
    assert.equal(arms?.length === 3 && ["int32", "uint32", "float64"].every(kind => arms.some(arm => arm.name === kind)), true,
      "the explicitly declared floating2^200 arm does not erase either original native integer peer");
  });
}
