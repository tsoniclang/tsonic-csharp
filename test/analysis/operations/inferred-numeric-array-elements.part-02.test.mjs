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
import { header, emptyProviders, compile, diagnosticLabel, accepted, arrays, constructedArrays, destinationBodies, actualDestinationEvidence, actualUnionDestinationEvidence } from "./inferred-numeric-array-elements.fixtures.mjs";

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
test(`${surface} actual ${name} destination changes physical i32 element storage`, () => {
    const program = accepted(compile(surface, body("float32", "runSingle") + body("number", "runDouble")));
    actualDestinationEvidence(program, ["float32", "float64"], name);
  });
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
