import assert from "node:assert/strict";
import test from "node:test";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { applyCsharpConversionSelection } from "../../../dist/backend/planner/expressions/conversions.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import {
  csharpDelegateTargetType,
  csharpNullableTargetType,
  csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../../../dist/target-model/types/index.js";

const policy = {
  projectTypes: { directSupertypes: () => [] },
  providers: { findTargetBindingByTargetId: () => undefined },
  target: {},
};
const stringType = csharpStringTargetType();
const integerType = csharpSourcePrimitiveTargetType("int32");
const booleanType = csharpSourcePrimitiveTargetType("bool");
const identity = Object.freeze({ kind: "identity" });
const identityReason = "C# identity conversion requires the exact same source and destination carrier.";

for (const [name, source] of [["reference", stringType], ["value", integerType]]) {
  test(`${name} nullable lifting classifies the complete outer carrier without a runtime adapter`, () => {
    const target = csharpNullableTargetType(source);
    const selected = selectCsharpConversion(policy, source, target, "implicit");
    assert.equal(selected.kind, "implicit", "the outer conversion is not an element identity");
    assert.equal(selected.proof, "nullable", "the existing native nullable proof owns lifting");
    assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true,
      "admission preserves the selected complete conversion");
    const expression = Object.freeze({ kind: "IdentifierName", name: "value" });
    const diagnostics = [];
    assert.equal(applyCsharpConversionSelection({}, {}, {}, diagnostics, source, target, selected, expression) === expression,
      true, "native implicit lifting emits the operand with no wrapper, call, copy or boxing");
    assert.equal(diagnostics.length, 0, "native lifting needs no planner diagnostic");
  });
}

test("identity admission requires the same complete carrier and exact generic binder", () => {
  const binder = Object.freeze({ kind: "type-parameter", name: "T", identity: "owner:first:T" });
  const foreign = Object.freeze({ ...binder, identity: "owner:second:T" });
  assert.equal(admitCsharpConversionSelection(policy, binder, binder, identity) === identity, true,
    "the actual binder identity remains valid");
  for (const [source, target] of [
    [stringType, csharpNullableTargetType(stringType)],
    [integerType, csharpNullableTargetType(integerType)],
    [integerType, booleanType],
    [binder, foreign],
    [undefined, integerType],
    [integerType, undefined],
  ]) {
    const admitted = admitCsharpConversionSelection(policy, source, target, identity);
    assert.equal(admitted.kind, "rejected", "a different complete pair cannot carry an identity leaf");
    assert.equal(admitted.reason, identityReason, "failure retains the exact identity contract");
  }
});

test("nullable mapping retains a nonidentity subtree and rejects a foreign element identity", () => {
  const narrow = csharpRuntimeUnionTargetType([stringType, integerType]);
  const wide = csharpRuntimeUnionTargetType([integerType, booleanType, stringType]);
  const source = csharpNullableTargetType(narrow);
  const target = csharpNullableTargetType(wide);
  const selected = selectCsharpConversion(policy, source, target, "implicit");
  assert.equal(selected.kind, "nullable-map", "nonidentity element mappings keep their native absence mapping");
  assert.equal(selected.conversion.kind, "union-map", "the complete selected union tree remains exact");
  assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true,
    "admission does not rebuild a correct nonidentity subtree");
  const rejected = admitCsharpConversionSelection(policy, source, target, { ...selected, conversion: identity });
  assert.equal(rejected.kind, "rejected", "different union elements cannot be replaced by an identity leaf");
  assert.equal(rejected.reason, identityReason, "nested identity uses the same complete-pair rule");
});

test("delegate and union injection admissions preserve exact nested generic binder identity", () => {
  const binder = Object.freeze({ kind: "type-parameter", name: "T", identity: "owner:first:T" });
  const foreign = Object.freeze({ ...binder, identity: "owner:second:T" });
  const source = csharpDelegateTargetType("System.Func", [foreign], binder);
  const target = csharpDelegateTargetType("System.Func", [binder], binder);
  const selected = Object.freeze({ kind: "delegate-adapter", strategy: "adaptation",
    parameterConversions: Object.freeze([identity]), returnConversion: identity });
  const rejected = admitCsharpConversionSelection(policy, source, target, selected);
  assert.equal(rejected.kind, "rejected", "same-spelled foreign delegate parameter binders stay distinct");
  assert.equal(rejected.reason, identityReason, "delegate admission checks each contravariant pair");
  const union = csharpRuntimeUnionTargetType([binder, booleanType]);
  const injected = Object.freeze({ kind: "implicit", proof: "runtime-union-arm", armIndex: 0,
    armType: binder, sourceToArm: identity });
  assert.equal(admitCsharpConversionSelection(policy, binder, union, injected) === injected, true,
    "the actual generic payload injects without a second conversion path");
  const rejectedInjection = admitCsharpConversionSelection(policy, foreign, union, injected);
  assert.equal(rejectedInjection.kind, "rejected", "the injection cannot erase its foreign source binder");
  assert.equal(rejectedInjection.reason, identityReason, "the nested source identity is checked");
});

test("wrong nullable elements and implicit absence removal remain rejected", () => {
  for (const [source, target] of [
    [booleanType, csharpNullableTargetType(integerType)],
    [stringType, csharpNullableTargetType(integerType)],
    [csharpNullableTargetType(integerType), integerType],
    [csharpNullableTargetType(stringType), stringType],
  ]) {
    assert.equal(selectCsharpConversion(policy, source, target, "implicit").kind, "rejected",
      "nullable lifting does not manufacture an element conversion or remove absence");
  }
});

test("native nullable reference and value lifting preserves identity and zero-allocation native costs", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export function lift(value: int32): int32 | null { return value; }
    export function keep(value: string): string | null { return value; }
    export function run(): boolean { return true; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.includes("int? lift(int value)"), true, "the actual value destination is native Nullable<int>");
  assert.equal(output.includes("string? keep(string value)"), true, "reference widening is only a native nullable annotation");
  const observed = executeCsharpConstruction(compiled, "complete-native-nullable-lifting", false, false, [], `
    static int? NativeLift(int value) => value;
    static string? NativeKeep(string value) => value;
    var text = new string('x', 32);
    int checksum = 0;
    for (int index = 0; index < 10000; index++) {
      checksum ^= Tsonic.Generated.Index.lift(index).GetValueOrDefault();
      checksum ^= NativeLift(index).GetValueOrDefault();
      if (!object.ReferenceEquals(Tsonic.Generated.Index.keep(text), text) || !object.ReferenceEquals(NativeKeep(text), text))
        throw new System.Exception("native reference identity");
    }
    long nativeStart = System.GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 100000; index++) {
      checksum ^= NativeLift(index).GetValueOrDefault();
      if (!object.ReferenceEquals(NativeKeep(text), text)) throw new System.Exception("native reference identity");
    }
    long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeStart;
    long generatedStart = System.GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 100000; index++) {
      checksum ^= Tsonic.Generated.Index.lift(index).GetValueOrDefault();
      if (!object.ReferenceEquals(Tsonic.Generated.Index.keep(text), text)) throw new System.Exception("generated reference identity");
    }
    long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedStart;
    if (nativeBytes != 0 || generatedBytes != nativeBytes || checksum != 0) throw new System.Exception("native nullable allocation parity");
    System.Console.WriteLine($"native={nativeBytes}; generated={generatedBytes}; checksum={checksum}");
  `);
  assert.equal(observed.includes("native=0; generated=0; checksum=0"), true, "native execution proves allocation and value parity");
});

test("empty arrays use exact checked authored and provider destinations without foreign source-file queries", () => {
  for (const sourceText of [
    `import type { int32 } from "@tsonic/core/types.js";
     function keep(values: int32[]): int32[] { return values; }
     export function create(): int32[] { return keep([]); }`,
    `import type { int32 } from "@tsonic/core/types.js";
     function keep<T>(values: T[]): T[] { return values; }
     export function create(): int32[] { return keep<int32>([]); }`,
    `import type { int32 } from "@tsonic/core/types.js";
     import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
     export function create(): List<int32> { return new List<int32>([]); }`,
  ]) {
    const compiled = compileCsharpSource({ sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(output.includes("new int[]"), true, "the actual selected int32 element owns empty construction");
    assert.equal(output.includes("new double[]") || output.includes("object[]"), false,
      "neither a floating default nor object boxing substitutes for the selected destination");
  }
});
