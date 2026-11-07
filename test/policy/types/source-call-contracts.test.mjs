// Call contracts over Host facts (nextgen C-2542 §2, R2, I4, I6). The deleted engine (resolution/call-contracts.ts,
// call-api.ts, calls.ts, source-profiles.ts, type-parameter-environment.ts) rebuilt call parameters, results and
// generic arguments from checker call info and checked binder references. Each protected behaviour is now:
//   - the selected signature, overload, receiver, argument correspondence, instantiated parameters and result:
//     facts.selections.call(use);
//   - generic arguments of calls, constructions and super calls: facts.instantiations.at(use), in binder declaration
//     order (receiver binders, then method binders);
//   - the .NET form (delegate optional/rest metadata, generic arguments, native widths): the one representation.
// A refused Host call is forwarded; C# never selects a replacement contract.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpRepresentationContext, representInstantiation } from "../../../dist/representation/index.js";
import {
  csharpNullableTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, getCsharpDelegateSignature, targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";

const int64 = csharpSourcePrimitiveTargetType("int64");
const int32 = csharpSourcePrimitiveTargetType("int32");
const float64 = csharpSourcePrimitiveTargetType("float64");
const string = csharpStringTargetType();

function fixture(sourceText) {
  const program = hostProgram(sourceText);
  const services = representationServices(program);
  const at = representations(services);
  const callNamed = (callee, predicate = node => program.ast.is.IsCallExpression(node)) => {
    const found = program.nodes.filter(node => predicate(node) &&
      program.ast.text(program.ast.as.AsCallExpression(node)?.Expression ?? node) === callee);
    assert.equal(found.length, 1, `one call of ${callee}`);
    return found[0];
  };
  const selection = use => {
    const selected = program.facts.selections.call(use);
    assert.equal(selected !== undefined && selected.kind !== "refused" && selected.use === use, true, "the Host selects this call");
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.parameters), true, "the selection record is immutable");
    return selected;
  };
  const instantiation = use => {
    const selected = program.facts.instantiations.at(use);
    assert.equal(selected !== undefined && selected.kind !== "refused", true, "the Host instantiates this generic use");
    return { selected, represented: representInstantiation(selected, csharpRepresentationContext(services, use, "type-argument")) };
  };
  return { program, services, at, callNamed, selection, instantiation };
}

test("only the Host invocation publishes generic arguments; an unrelated generic declaration is never consulted", () => {
  const current = fixture(`
declare class NativeCatalog<Native> {}
declare function invoke<Item>(sample: Item, values: Item[]): Item;
declare const sample: number;
declare const values: number[];
export const result = invoke(sample, values);
`);
  const call = current.callNamed("invoke");
  const { selected, represented: native } = current.instantiation(call);
  const item = current.program.ast.typeParameters(current.program.named("invoke"))[0];
  const catalog = current.program.ast.typeParameters(current.program.named("NativeCatalog"))[0];
  assert.equal(selected.method.length === 1 && selected.method[0].declaration === item, true, "the binder is the callee's own");
  assert.equal(selected.method.some(binding => binding.declaration === catalog), false, "a distinct binder never stands in");
  assert.equal(targetTypeRefEquals(represented(native.method[0]), float64), true, "the Host invocation is the sole float64 authority");
  assert.equal(targetTypeRefEquals(represented(native.result), float64), true);
  assert.equal(native.parameters.length, 2);
  const array = represented(native.parameters[1]);
  assert.equal(array.kind === "array" && targetTypeRefEquals(array.element, float64), true, "instantiated parameters are closed");
});

test("stored aliases use their own closed input and result, never a creation template", () => {
  const current = fixture(`
import type { int64 } from "@tsonic/core/types.js";
declare const invoke: (value: int64) => int64;
export const result = invoke(1n);
`);
  const call = current.callNamed("invoke");
  const selected = current.selection(call);
  assert.equal(selected.parameters.length, 1);
  assert.equal(targetTypeRefEquals(represented(current.at.type(selected.parameters[0], call, "storage")), int64), true,
    "closed int64 input");
  assert.equal(targetTypeRefEquals(represented(current.at.type(selected.result, call, "value")), int64), true, "closed int64 result");
  assert.equal(current.program.facts.instantiations.at(call), undefined, "a closed stored callable has no instantiation");
});

test("stored quantified protocols are instantiated per invocation with exact binders", () => {
  const current = fixture(`
import type { int64 } from "@tsonic/core/types.js";
declare const invoke: <Value>(value: Value) => Value[];
const wide: int64 = 1n;
export const result = invoke(wide);
`);
  const call = current.callNamed("invoke");
  const { selected, represented: native } = current.instantiation(call);
  assert.equal(selected.kind === "call" && selected.method.length === 1 && selected.receiver.length === 0, true);
  assert.equal(targetTypeRefEquals(represented(native.method[0]), int64), true, "the quantifier binds int64 at this use only");
  const result = represented(native.result);
  assert.equal(result.kind === "array" && targetTypeRefEquals(result.element, int64), true, "the result is closed over the binding");
});

test("binders are bound in declaration order, independently of argument order", () => {
  const current = fixture(`
import type { int32 } from "@tsonic/core/types.js";
function pair<First, Second>(second: Second, first: First): [First, Second] { return [first, second]; }
export const result = pair("x", 1 as int32);
`);
  const { selected, represented: native } = current.instantiation(current.callNamed("pair"));
  const [first, second] = current.program.ast.typeParameters(current.program.named("pair"));
  assert.equal(selected.method[0].declaration === first && selected.method[1].declaration === second, true);
  assert.equal(targetTypeRefEquals(represented(native.method[0]), int32), true, "First = int32");
  assert.equal(targetTypeRefEquals(represented(native.method[1]), string), true, "Second = string");
});

test("the Host-selected overload owns the parameters; C# never re-selects it", () => {
  const current = fixture(`
import type { int32 } from "@tsonic/core/types.js";
function pick(value: int32): int32;
function pick(value: string): string;
function pick(value: int32 | string): int32 | string { return value; }
export const narrow = pick("x");
`);
  const call = current.callNamed("pick");
  const selected = current.selection(call);
  const overloads = current.program.facts.navigation.identity.declarations(selected.signature);
  assert.equal(selected.overloadIndex, 1, "the string overload");
  assert.equal(overloads.length >= 2 && overloads[1] === selected.signature, true, "the signature is the second authored overload");
  assert.equal(targetTypeRefEquals(represented(current.at.type(selected.parameters[0], call, "storage")), string), true,
    "the narrow overload parameter, not the implementation union");
  assert.equal(targetTypeRefEquals(represented(current.at.type(selected.result, call, "value")), string), true);
});

test("optional and rest metadata of a stored callable are exact in its delegate", () => {
  const current = fixture(`
import type { int64 } from "@tsonic/core/types.js";
declare const invoke: (first?: int64, ...rest: string[]) => void;
export function run(): void { invoke(); invoke(1n, "a", "b"); }
`);
  const reference = current.program.nodes.find(node => current.program.ast.is.IsIdentifier(node) &&
    current.program.ast.text(node) === "invoke" && current.program.ast.is.IsCallExpression(current.program.ast.parent(node)));
  const signature = getCsharpDelegateSignature(represented(current.at.value(reference)));
  assert.notEqual(signature, undefined, "a one-signature callable is a .NET delegate");
  assert.equal(signature.parameters.length, 2, "optional and rest are distinct slots");
  assert.equal(targetTypeRefEquals(signature.parameters[0], csharpNullableTargetType(int64)), true, "an optional slot accepts absence");
  assert.deepEqual(signature.optionalParameterIndexes, [0]);
  assert.equal(signature.restParameterIndex, 1, "variadic omission is the rest slot, not another optional slot");
  for (const call of current.program.nodes.filter(node => current.program.ast.is.IsCallExpression(node))) {
    const selected = current.selection(call);
    assert.equal(selected.arguments.every(argument => argument.parameterIndex <= 1), true);
    assert.equal(selected.arguments.filter(argument => argument.parameterIndex === 1).every(argument => argument.mode === "rest-element"), true,
      "rest arguments are published as rest elements of parameter 1");
  }
});

test("a wide optional signature publishes every parameter once and keeps every optional index", () => {
  const width = 48;
  const parameters = Array.from({ length: width }, (_value, index) => `value${index}?: string`).join(", ");
  const current = fixture(`declare const invoke: (${parameters}) => void; export function run(): void { invoke(); }`);
  const call = current.callNamed("invoke");
  assert.equal(current.selection(call).parameters.length, width);
  const reference = current.program.ast.as.AsCallExpression(call).Expression;
  const signature = getCsharpDelegateSignature(represented(current.at.value(reference)));
  // .NET Func/Action stop at 16 parameters; a wider delegate is a CSHARP_ refusal, never a truncated contract.
  if (signature === undefined) {
    const refused = current.at.value(reference);
    assert.equal(refused.kind === "csharp-refused" || refused.kind === "refused", true);
  } else {
    assert.deepEqual(signature.optionalParameterIndexes, Array.from({ length: width }, (_value, index) => index));
  }
});

test("a refused Host call is published as a refusal and no C# contract replaces it", () => {
  const current = fixture(`declare const untyped: any; export function run(): void { untyped(1); }`);
  const call = current.callNamed("untyped");
  const refused = current.program.facts.selections.call(call);
  assert.equal(refused?.kind, "refused", "an untyped callee has no call selection");
  assert.equal(refused.code, "TSONIC_SOURCE_CALL_UNTYPED");
  assert.equal(current.program.facts.refusals().some(entry => entry.code === refused.code && entry.site === refused.site), true,
    "the refusal is collected once for forwarding (R5)");
});

test("super construction is instantiated at the base class with the heritage arguments", () => {
  const current = fixture(`
import type { int64 } from "@tsonic/core/types.js";
class Base<Value> { constructor(readonly value: Value) {} }
class Child extends Base<int64> { constructor() { super(1n); } }
export const child = new Child();
`);
  const call = current.program.nodes.find(node => current.program.ast.is.IsCallExpression(node) &&
    current.program.ast.text(node).startsWith("super("));
  const selected = current.selection(call);
  assert.equal(selected.kind, "super-call");
  const { selected: instantiation, represented: native } = current.instantiation(call);
  const binder = current.program.ast.typeParameters(current.program.named("Base"))[0];
  assert.equal(instantiation.receiver.length === 1 && instantiation.receiver[0].declaration === binder, true,
    "the base class binder is bound at the receiver, not at a method");
  assert.equal(targetTypeRefEquals(represented(native.receiver[0]), int64), true, "heritage int64 is the base environment");
  assert.equal(targetTypeRefEquals(represented(native.parameters[0]), int64), true);
});
