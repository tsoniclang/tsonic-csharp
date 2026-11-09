import assert from "node:assert/strict";
import test from "node:test";
import { applyCsharpNativeCallableMember, csharpNativeTypeArgumentSatisfiesConstraints } from "../../../dist/policy/conversions/generic-callable.js";
import * as genericCallable from "../../../dist/policy/conversions/generic-callable.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { csharpDelegateTargetType, getCsharpCallableMembers } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource, withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";
import { csharpProviderBindingFromResolution } from "../../../dist/providers/model/relation-resolver.js";
import { csharpTargetTypeFromBinding } from "../../../dist/policy/types/storage/bindings.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const policy = createNativeConversionHost();
const integer = { kind: "source-primitive", name: "int64" };

test("Native callable and write-obligation constraints share one complete physical satisfaction law", () => {
  const cases = [
    ["unconstrained", [], true],
    ["value", [{ kind: "keyword", keyword: "struct" }], true],
    ["reference", [{ kind: "keyword", keyword: "class" }], false],
    ["unmanaged", [{ kind: "keyword", keyword: "unmanaged" }], true],
    ["constructor", [{ kind: "constructor" }], true],
  ];
  assert.deepEqual(cases.map(([name]) => name), ["unconstrained", "value", "reference", "unmanaged", "constructor"]);
  for (const [name, constraints, accepted] of cases) {
    const parameter = { kind: "type-parameter", identity: `constraint:${name}`, name: "Value",
      csharpConstraints: { kind: "resolved", constraints } };
    const selected = callable(parameter);
    assert.equal(csharpNativeTypeArgumentSatisfiesConstraints(policy, integer, constraints), accepted, name);
    assert.equal(applyCsharpNativeCallableMember(policy, selected.member, [integer]) !== undefined, accepted,
      `${name}: the actual callable application uses that identical Native law`);
  }
});

function callable(parameter, parameters = [parameter]) {
  const member = Object.freeze({ name: "Invoke", typeParameters: Object.freeze([Object.freeze({
    identity: parameter.identity, name: parameter.name, constraints: parameter.csharpConstraints.constraints,
  })]), signature: Object.freeze({ kind: "call", parameters: Object.freeze(parameters),
    parameterPassingModes: Object.freeze(parameters.map(() => "by-value")), returnType: parameter }) });
  const carrier = Object.freeze({ ...csharpTargetNamedType("Fixture.GenericCallable", [],
    { kind: "named", name: "GenericCallable" }, { sourceDeclarationKind: "interface",
      constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [] }),
    csharpCallableMembers: Object.freeze([member]) });
  return { carrier, member };
}

test("one explicit native member application owns exact callback signatures, constraints and admission", () => {
  const parameter = { kind: "type-parameter", identity: "identity:Value", name: "Value",
    csharpConstraints: { kind: "resolved", constraints: [] } };
  const source = callable(parameter);
  const destination = csharpDelegateTargetType("System.Func", [integer], integer);
  const applied = applyCsharpNativeCallableMember(policy, source.member, [integer]);
  assert.equal(applied !== undefined && applied.typeParameters.length === 0 &&
    targetTypeRefEquals(applied.signature.parameters[0], integer), true,
    "the complete already-selected binder vector is applied without destination inference");
  const application = Object.freeze({ original: source.member, applied, typeArguments: Object.freeze([integer]) });
  const members = Object.freeze({ source: applied, target: getCsharpCallableMembers(destination)[0],
    sourceApplication: application });
  const selected = selectCsharpConversion(policy, source.carrier, destination, "implicit", members);
  assert.equal(selected.kind === "delegate-adapter" && selected.strategy === "native-binding" &&
    selected.members.sourceApplication === application, true,
    "the exact original/applied Native association is retained without erased arguments");
  assert.equal(selectCsharpConversion(policy, source.carrier, destination, "implicit").kind, "rejected",
    "a quantified input cannot infer Source binders from a physically matching destination");
  const forged = { ...members, sourceApplication: { ...application,
    typeArguments: [{ kind: "source-primitive", name: "float64" }] } };
  assert.equal(selectCsharpConversion(policy, source.carrier, destination, "implicit", forged).kind, "rejected",
    "different Native arguments cannot reuse the selected applied member");
  const conflicting = callable(parameter, [parameter, parameter]);
  const conflictingApplied = applyCsharpNativeCallableMember(policy, conflicting.member, [integer]);
  const incompatible = csharpDelegateTargetType("System.Func", [integer,
    { kind: "source-primitive", name: "float64" }], integer);
  assert.equal(selectCsharpConversion(policy, conflicting.carrier, incompatible, "implicit", {
    source: conflictingApplied, target: getCsharpCallableMembers(incompatible)[0],
    sourceApplication: { original: conflicting.member, applied: conflictingApplied, typeArguments: [integer] },
  }).kind, "rejected", "one quantified input cannot independently bind two incompatible Native arguments");
  const requiredClass = { ...parameter, csharpConstraints: { kind: "resolved",
    constraints: [{ kind: "keyword", keyword: "class" }] } };
  assert.equal(applyCsharpNativeCallableMember(policy, callable(requiredClass).member, [integer]), undefined,
    "a native value argument does not satisfy a reference-only generic constraint");
  assert.equal(applyCsharpNativeCallableMember(policy, source.member, []), undefined,
    "a missing complete binder vector cannot manufacture an instantiation");
  assert.equal(Object.hasOwn(genericCallable, "selectCsharpCallableInstantiation"), false,
    "the retired destination-inference chooser has no compatibility export");
  assert.equal(Object.hasOwn(genericCallable, "instantiateCsharpCallableContract"), false,
    "the old wrapper-contract application has no competing path");
});

for (const surface of ["native", "js"]) {
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
