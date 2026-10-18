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
  csharpTsValueTargetType,
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

test("closed JsValue facets preserve their logical identities under an explicit native representation proof", () => {
  const native = csharpTsValueTargetType();
  const left = Object.freeze({ ...native, id: "logical:left", csharpJsObjectShape: true });
  const right = Object.freeze({ ...native, id: "logical:right", csharpJsObjectShape: true });
  for (const [source, target] of [[native, left], [left, native], [left, right]]) {
    const selected = selectCsharpConversion(policy, source, target, "implicit");
    assert.equal(selected.kind, "implicit", "a different complete logical pair is not identity");
    assert.equal(selected.proof, "native-representation", "the exact canonical native render owns the no-op");
    assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true,
      "pre-seal admission checks the same physical evidence");
    assert.equal(admitCsharpConversionSelection(policy, source, target, identity).kind, "rejected",
      "the logical identity comparator remains strict for every faceted pair");
    const expression = Object.freeze({ kind: "IdentifierName", name: "value" });
    const diagnostics = [];
    assert.equal(applyCsharpConversionSelection({}, {}, {}, diagnostics, source, target, selected, expression) === expression,
      true, "the native representation proof adds no cast, wrapper, allocation, boxing or copy node");
    assert.equal(diagnostics.length, 0, "rendering makes no conversion decision");
  }
});

test("native representation admission refuses foreign binders, non-JsValue carriers and different native renders", () => {
  const native = csharpTsValueTargetType();
  const binder = Object.freeze({ kind: "type-parameter", name: "T", identity: "owner:first:T" });
  const foreign = Object.freeze({ ...binder, identity: "owner:second:T" });
  const generic = Object.freeze({ ...native, id: "logical:generic", typeArguments: [binder] });
  const foreignGeneric = Object.freeze({ ...generic, typeArguments: [foreign] });
  const selected = Object.freeze({ kind: "implicit", proof: "native-representation" });
  for (const [source, target] of [[generic, foreignGeneric], [native, generic], [binder, foreign], [native, native],
    [native, integerType], [native, { ...native, id: "logical:nominal", csharpJsValueCarrier: undefined }],
    [native, { ...native, id: "logical:class", csharpRender: { kind: "named", name: "NativeClass" } }],
    [native, { ...native, id: "logical:namespace", csharpRender: { ...native.csharpRender, namespace: ["Other", "Runtime"] } }],
    [native, { ...native, id: "logical:arity", csharpRender: { ...native.csharpRender, genericArity: 1 } }],
    [native, { ...native, id: "logical:alias", csharpRender: { ...native.csharpRender, externAlias: "other" } }],
    [native, { ...native, id: "logical:nested", csharpRender: { ...native.csharpRender, nested: [{ name: "Inner" }] } }],
    [native, { ...native, id: "logical:nullable", csharpNullableReference: true }],
  ]) {
    const admitted = admitCsharpConversionSelection(policy, source, target, selected);
    assert.equal(admitted.kind, "rejected", "a flag, spelling or different binder never establishes a physical identity");
    assert.equal(admitted.reason,
      "C# native representation conversion requires distinct closed non-generic JsValue carriers with the same canonical native render.",
      "the one pre-seal contract gives the exact rejection");
  }
  assert.equal(selectCsharpConversion(policy, generic, foreignGeneric, "implicit").kind, "rejected",
    "a later conversion selector cannot erase a foreign generic binder");
  assert.equal(selectCsharpConversion(policy, native,
    { ...native, id: "logical:wrong-native", csharpRender: { kind: "named", name: "NativeClass" } }, "implicit").kind,
  "rejected", "the producer refuses mismatched physical renders rather than falling through");
});

test("checked JSON structural views preserve native value identity without a conversion adapter", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function readTitle(text: string): string | undefined {
      const value = JSON.parse(text) as { title?: unknown };
      if (typeof value.title !== "string") return undefined;
      return value.title;
    }
    export function same(text: string): boolean {
      const raw = JSON.parse(text);
      const left = raw as { title?: unknown };
      const right = raw as { title?: unknown };
      return left === right;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.includes("Tsonic.CSharp.Runtime.TsValue value = Tsonic.CSharp.Js.JSON.parse(text);"), true,
    "the actual native TsValue is stored directly under its checked structural view");
  assert.equal(output.includes("Tsonic.CSharp.Runtime.TsValue left = raw;") &&
    output.includes("Tsonic.CSharp.Runtime.TsValue right = raw;"), true, "facets retain the same native value");
  const observed = executeCsharpConstruction(compiled, "native-json-structural-views", false, false, [], `
    if (Tsonic.Generated.Index.readTitle("""{"title":"ok"}""") != "ok" ||
        Tsonic.Generated.Index.readTitle("""{"title":1}""") != null ||
        Tsonic.Generated.Index.readTitle("""{}""") != null ||
        !Tsonic.Generated.Index.same("""{"title":"ok"}"""))
      throw new System.Exception("native JSON structural view identity");
    System.Console.WriteLine("title=ok; nonstring=null; absent=null; identity=true");
  `);
  assert.equal(observed.includes("title=ok; nonstring=null; absent=null; identity=true"), true,
    "native execution proves presence, narrowing, one absence state and preserved identity");
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

for (const [name, sourceText, message] of [
  ["a present number used as a delegate", "export const callback: (() => void) = 1;",
    "Type 'number' is not assignable to type '() => void'."],
  ["absence used as a present native integer", `import type { int32 } from "@tsonic/core/types.js";
export function value(): int32 { return undefined; }`, "Type 'undefined' is not assignable to type 'number'."],
]) {
  test(`checked source rejects ${name} before conversion records or planning`, () => {
    const compiled = compileCsharpSource({ sourceText });
    const diagnostics = compiled.result.diagnostics;
    assert.equal(diagnostics.length, 1, "the checked source has one exact admission refusal");
    assert.equal(diagnostics[0].code, "TSTS_DIAGNOSTIC", "source assignability owns the rejection");
    assert.equal(diagnostics[0].evidence.includes("tsts.code=TS2322"), true, "the actual checked assignability diagnostic is retained");
    assert.equal(diagnostics[0].message.endsWith(message), true, "the complete incompatible pair is named");
    assert.equal(compiled.result.program === undefined, true, "invalid source publishes no conversion records");
    assert.equal(compiled.result.plan === undefined, true, "invalid source never reaches the planner");
    assert.equal(compiled.result.artifacts.length, 0, "invalid source emits no artifact");
  });
}

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

test("provider empty-array construction has the same exact native type and allocation cost as handwritten C#", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
    export function create(): List<int32> { return new List<int32>([]); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.includes("new System.Collections.Generic.List<int>(new int[] { })"), true,
    "the checked provider formal selects an ordinary native int array and List constructor");
  const observed = executeCsharpConstruction(compiled, "native-provider-empty-array-cost", false, false, [], `
    static System.Collections.Generic.List<int> NativeCreate() => new System.Collections.Generic.List<int>(new int[] { });
    for (int index = 0; index < 1000; index++) {
      System.GC.KeepAlive(NativeCreate());
      System.GC.KeepAlive(Tsonic.Generated.Index.create());
    }
    long nativeStart = System.GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) System.GC.KeepAlive(NativeCreate());
    long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeStart;
    long generatedStart = System.GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) System.GC.KeepAlive(Tsonic.Generated.Index.create());
    long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedStart;
    System.Collections.Generic.List<int> value = Tsonic.Generated.Index.create();
    if (value.Count != 0 || value.Capacity != 0 || generatedBytes != nativeBytes)
      throw new System.Exception("native List allocation parity");
    System.Console.WriteLine($"native={nativeBytes}; generated={generatedBytes}; count={value.Count}");
  `);
  assert.match(observed, /native=([0-9]+); generated=\1; count=0/u,
    "native execution proves the exact provider type, value and allocation parity without boxing or a wrapper");
});
