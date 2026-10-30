import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpCallableInstantiation } from "../../../dist/policy/conversions/generic-callable.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";
import { csharpDelegateTargetType, getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource, withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";
import { csharpProviderBindingFromResolution } from "../../../dist/providers/model/relation-resolver.js";
import { csharpTargetTypeFromBinding } from "../../../dist/policy/types/storage/bindings.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const policy = { projectTypes: { directSupertypes: () => [] }, providers: {
  findTargetBindingByTargetId: () => ({ kind: "missing" }),
  findTargetBindingByMetadataName: () => ({ kind: "missing" }),
} };
const integer = { kind: "source-primitive", name: "int64" };

function callable(parameter, parameters = [parameter]) {
  const signature = csharpDelegateTargetType("System.Func", parameters, parameter);
  const owner = createStructuralObjectShapeTarget([{ sourceKey: { kind: "property", name: "Invoke" },
    sourceName: "Invoke", targetName: "Invoke", memberKind: "method", type: signature,
    typeParameters: [{ declaration: {}, identity: parameter.identity, name: parameter.name,
      csharpAllowsRefLike: false, constraints: parameter.csharpConstraints.constraints }] }], undefined,
  () => ({ kind: "resolved", constraints: [] }), true);
  return csharpMethodValueType(owner, "Invoke", "generic.identity", signature, [parameter.identity]);
}

test("one native method instantiation owns exact callback signatures, constraints and admission", () => {
  const parameter = { kind: "type-parameter", identity: "identity:Value", name: "Value",
    csharpConstraints: { kind: "resolved", constraints: [] } };
  const source = callable(parameter);
  assert.equal(source !== undefined, true, "the actual generic method contract is constructed");
  const destination = csharpDelegateTargetType("System.Func", [integer], integer);
  const selected = selectCsharpConversion(policy, source, destination, "implicit");
  assert.equal(selected.kind === "delegate-adapter" && selected.strategy === "native-binding" &&
    selected.instantiation?.typeArguments.length === 1 &&
    targetTypeRefEquals(selected.instantiation.typeArguments[0], integer), true,
  "the selected exact native input instantiates the original method once");
  assert.equal(admitCsharpConversionSelection(policy, source, destination, selected).kind, "delegate-adapter",
    "the same selected contract is admitted without erased generic arguments");
  const forged = { ...selected, instantiation: { ...selected.instantiation,
    typeArguments: [{ kind: "source-primitive", name: "float64" }] } };
  assert.equal(admitCsharpConversionSelection(policy, source, destination, forged).kind, "rejected",
    "different native generic arguments cannot reuse the selected callback contract");
  const conflicting = callable(parameter, [parameter, parameter]);
  assert.equal(selectCsharpCallableInstantiation(policy, conflicting,
    getCsharpDelegateSignature(csharpDelegateTargetType("System.Func", [integer,
      { kind: "source-primitive", name: "float64" }], integer))), undefined,
  "one quantified input cannot be independently rebound by two incompatible native arguments");
  const requiredClass = { ...parameter, csharpConstraints: { kind: "resolved",
    constraints: [{ kind: "keyword", keyword: "class" }] } };
  assert.equal(selectCsharpCallableInstantiation(policy, callable(requiredClass), getCsharpDelegateSignature(destination)), undefined,
    "a native value argument does not satisfy a reference-only generic constraint");
  const noInput = csharpDelegateTargetType("System.Action", [], csharpVoidTargetType());
  assert.equal(selectCsharpCallableInstantiation(policy, source, getCsharpDelegateSignature(noInput)), undefined,
    "an unavailable input cannot manufacture a generic instantiation");
});

for (const surface of ["native", "js"]) {
  test(`a bare quantified input retains its native carrier rather than its implemented views on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
interface Score { score: int64; }
class Entry implements Score { score: int64 = 9007199254740993n; }
function identity<Value>(value: Value): Value { return value; }
function replace<Value extends object>(value: Value, replacement: Value): Value { return replacement; }
function read<Value extends Score>(value: Value): int64 { return value.score; }
export function run(): boolean {
  const entry = new Entry();
  const replacement = new Entry();
  const selected = replace(entry, replacement);
  return identity(entry) === entry && selected === replacement && selected !== entry &&
    read(entry) === 9007199254740993n && read(selected) === 9007199254740993n;
}` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/DynamicInvoke|TsValue|Convert\.ToDouble|\.ToArray\(|\.Clone\(/u.test([...compiled.artifacts.values()].join("\n")), false,
      "direct quantified inputs retain exact native identity and widths without a copied implemented-view transport");
    executeCsharpConstruction(compiled, `generic-direct-native-input-${surface}`);
  });
  test(`generic input binding uses its existing exact native implemented view on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
type Box<Value> = { value: Value };
function first<Value>(box: Box<Value>): Value { return box.value; }
function change<Value>(box: Box<Value>, value: Value): Box<Value> { box.value = value; return box; }
export function run(): boolean {
  const narrow: Box<int32> = { value: 7 as int32 };
  const wide: Box<int64> = { value: 9007199254740993n as int64 };
  const text: Box<string> = { value: "before" };
  const alias = wide;
  const before = first(wide);
  const changed = change(wide, 9007199254740995n as int64);
  return first(narrow) === 7 && before === 9007199254740993n && changed === wide && alias === wide &&
    alias.value === 9007199254740995n && first(text) === "before" && change(text, "after") === text && text.value === "after";
}` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/DynamicInvoke|TsValue|Convert\.ToDouble|\.ToArray\(|\.Select\(/u.test([...compiled.artifacts.values()].join("\n")), false,
      "the selected input retains native width, original reference identity and the existing one generic body");
    executeCsharpConstruction(compiled, `generic-implemented-native-input-${surface}`);
  });
  test(`native implemented input evidence cannot override explicit or conflicting generic bindings on ${surface}`, () => {
    for (const [label, invocation] of [["explicit", "first<number>(signed)"], ["conflicting", "pair(signed, unsigned)"]]) {
      const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, uint32 } from "@tsonic/core/types.js";
type Box<Value> = { value: Value };
function first<Value>(box: Box<Value>): Value { return box.value; }
function pair<Value>(left: Box<Value>, right: Box<Value>): Value { return left.value; }
export function run(): boolean {
  const signed: Box<int32> = { value: 7 as int32 };
  const unsigned: Box<uint32> = { value: 9 as uint32 };
  return ${invocation} === 7;
}` });
      assert.equal(compiled.sourceDiagnosticsText, "", `${label}: the checker admits the original logical number domain`);
      assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.category === "error"), true,
        `${label}: exact conflicting native evidence cannot choose the first input or change the explicit declaration contract`);
      assert.equal(compiled.targetDiagnostics.every(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST"), true,
        `${label}: only the exact existing native admission refusal is expected, never an unrelated resource or invariant failure`);
      assert.equal(compiled.artifacts.size, 0, `${label}: failed exact native admission publishes no artifacts`);
    }
  });
  test(`closed generic callback constraints use actual native numeric implementation metadata on ${surface}`, { timeout: 300_000 }, () => {
    const { compiled, value: numericBinding } = withCsharpSessionRequest({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
function same<Value extends number>(value: Value): Value { return value; }
function sameWide<Value extends bigint>(value: Value): Value { return value; }
export function run(): boolean {
  const callback: (value: int32) => int32 = same;
  const wideCallback: (value: int64) => int64 = sameWide;
  const wide: int64 = 9007199254740993n;
  return callback(7) === 7 && wideCallback(wide) === wide;
}` }, request => csharpProviderBindingFromResolution(request.providers.findTargetBindingByMetadataName("System.Numerics.INumber`1", "ordinary")));
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(numericBinding !== undefined, true, "the exact native numeric interface binding owns generic constraint identity");
    const program = compiled.result.program;
    const constraints = [];
    const visit = node => {
      if (program.source.ast.is.IsTypeParameterDeclaration(node)) {
        const selected = program.records.typeParameterConstraints.get(node);
        assert.equal(selected?.kind, "resolved", "the authored numeric binder retains one completed native constraint");
        constraints.push(...selected.constraints.filter(constraint => constraint.kind === "type"));
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of program.source.sourceFiles) if (program.source.ast.getFileName(file) === "/project/index.ts") visit(file);
    assert.equal(constraints.length, 2, "both source numeric domains retain their original native INumber constraint");
    for (const constraint of constraints) {
      const argument = constraint.type.typeArguments?.[0];
      assert.equal(argument?.kind, "type-parameter", "constraint publication preserves the original exact generic binder");
      assert.equal(targetTypeRefEquals(constraint.type, csharpTargetTypeFromBinding(numericBinding, [argument])), true,
        "the constraint uses the actual provider-qualified interface, never a competing metadata-name identity");
    }
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/INumber<Value>/u.test(output), true, "the original numeric native constraint remains on the one method body");
    assert.equal(/DynamicInvoke|TsValue|Convert\.ToDouble/u.test(output), false,
      "numeric constraint admission cannot erase the exact native callback argument");
    executeCsharpConstruction(compiled, `generic-callback-numeric-constraint-${surface}`);
  });
  test(`generic method callback instantiation preserves exact native width and one body on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
let calls = 0;
function apply<Value>(callback: (value: Value, index: int32) => Value, value: Value): Value {
  return callback(value, 3);
}
function generic<Value>(value: Value): Value {
  function same<Actual extends Value>(actual: Actual): Actual { calls++; return actual; }
  return apply<Value>(same, value);
}
export function run(): boolean {
  calls = 0;
  const wide: int64 = 9007199254740993n;
  return generic<int64>(wide) === wide && calls === 1;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/DynamicInvoke|TsValue|Convert\.ToDouble/u.test(output), false,
      "native generic callbacks retain their exact physical carrier without erased transport");
    assert.equal(/\)same\b|same\.__tsonic_/u.test(output), false,
      "the original generic method is not cast to a callable object or accessed as a protocol instance");
    executeCsharpConstruction(compiled, `generic-callable-instantiation-${surface}`);
  });
  test(`closed native bindings retain one captured generic method across distinct callbacks on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
function apply<Value>(callback: (value: Value) => Value, value: Value): Value { return callback(value); }
function applyIndexed<Value>(callback: (value: Value, index: int32) => Value, value: Value): Value { return callback(value, 3); }
function identity<Value>(value: Value): Value { return value; }
export function run(): boolean {
  let calls = 0;
  function captured<Value>(value: Value): Value { calls++; return value; }
  const wide: int64 = 9007199254740993n;
  const first: int64 = apply<int64>(captured, wide);
  const second: string = apply<string>(captured, "retained");
  const third: int64 = applyIndexed<int64>(captured, wide);
  const fourth: int64 = applyIndexed<int64>(captured, wide);
  return first === wide && second === "retained" && third === wide && fourth === wide &&
    calls === 4 && apply<int64>(identity, wide) === wide;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/DynamicInvoke|TsValue|Convert\.ToDouble/u.test(output), false,
      "each closed binding targets the original native generic method and shared capture, not a polymorphic value wrapper");
    assert.equal(/captured\.__tsonic_/u.test(output), false,
      "a native captured local method is never read as a generic protocol object");
    executeCsharpConstruction(compiled, `captured-generic-native-bindings-${surface}`);
  });
}
