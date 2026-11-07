import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpSourceProfileInputs } from "../../../../dist/analysis/program/records/program/source-profile-inputs.js";
import { csharpDelegateTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

// Basis (nextgen C-2542, signed by Claude): the profile inputs read the Host call selection (`parameters` after
// instantiation, `arguments` = argument → parameter correspondence) and published argument descriptors. The declared
// parameter carrier is `types.represent(parameter.type, call, "storage")`; the callable-arm projection rule is unchanged.
const scalar = csharpSourcePrimitiveTargetType("int32");
const callable = csharpDelegateTargetType("System.Func", [scalar], scalar);
const sequence = { kind: "array", element: scalar };
const declared = csharpNullableTargetType(csharpRuntimeUnionTargetType([callable, sequence]));
const callableDescriptor = Object.freeze({ kind: "callable", calls: [{ typeParameters: [], parameters: [],
  result: { kind: "primitive", primitive: "int32" } }], constructs: [] });
const plainDescriptor = Object.freeze({ kind: "array", readonly: false, element: { kind: "primitive", primitive: "int32" } });

function inputs(options = {}) {
  const argument = { expression: {}, type: options.callable === false ? plainDescriptor : callableDescriptor };
  const parameterType = Object.freeze({ kind: "union", types: [callableDescriptor, plainDescriptor] });
  const binding = { argument: argument.expression, parameterIndex: 0, form: "value" };
  const call = {};
  const selection = Object.freeze({ use: call, kind: "call", callee: {}, signature: {}, overloadIndex: 0,
    arguments: [binding], parameters: [{ type: parameterType }], result: { kind: "primitive", primitive: "int32" }, optionalChain: false });
  const source = Object.freeze({ call, selection, arguments: options.foreign ? [] : [argument],
    parameters: selection.parameters,
    bindings: options.bindings ?? [{ ...binding, ...options.binding, ...(options.parameterIndex === undefined ? {} : { parameterIndex: options.parameterIndex }) }],
    typeArguments: [] });
  let reads = 0;
  const host = {
    ast: { is: { IsSpreadElement: () => false } },
    types: {
      value: () => scalar,
      instantiation: () => undefined,
      represent(type, occurrence, position) {
        if (position !== "storage") return scalar;
        assert.equal(type === parameterType && occurrence === call, true, "the published instantiated parameter at the exact call");
        reads++;
        return options.declared ?? declared;
      },
    },
  };
  const value = createCsharpSourceProfileInputs(host, options.foreign ? [] : [argument], call, {}, source);
  assert.equal(reads, 1, "one native parameter read, no reselection");
  return value.parameters[0];
}

test("callable input projects the unique declared native union arm without a finished body carrier", () => {
  assert.equal(inputs() === callable, true, "the declared native delegate, not a guessed body signature");
});

test("declared callable union projection refuses foreign, ambiguous and spread binding correspondence", () => {
  for (const options of [{ foreign: true }, { binding: { argument: {} } },
    { binding: { form: "spread" } }, { binding: { form: "rest-element" } },
    { bindings: [{ parameterIndex: 0, form: "value" }, { parameterIndex: 0, form: "value" }] }]) {
    assert.equal(inputs(options) === undefined, true, "an unproven argument correspondence refuses");
  }
  // Parameter-index mismatch (baseline control { parameterIndex: 1 }): a callable argument bound to another parameter
  // never projects this parameter's callable arm; the unbound parameter keeps its whole declared carrier.
  assert.equal(inputs({ parameterIndex: 1 }) === declared, true, "a binding of another parameter selects no callable arm here");
});

test("declared callable union projection refuses missing and nonunique native callable arms", () => {
  const other = csharpDelegateTargetType("System.Func", [], scalar);
  for (const type of [csharpRuntimeUnionTargetType([scalar, sequence]), csharpRuntimeUnionTargetType([callable, other])]) {
    assert.equal(inputs({ declared: type }) === undefined, true, "exactly one declared callable arm is required");
  }
});

test("noncallable and absence input retain the whole declared parameter and direct delegates retain optionality", () => {
  assert.equal(inputs({ callable: false }) === declared, true, "the property-list and absence domain is unchanged");
  const optional = csharpNullableTargetType(callable);
  assert.equal(inputs({ declared: optional }) === optional, true, "no second projection for a genuinely delegate-typed parameter");
});
