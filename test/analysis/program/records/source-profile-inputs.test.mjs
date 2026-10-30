import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpSourceProfileInputs } from "../../../../dist/analysis/program/records/program/source-profile-inputs.js";
import { csharpDelegateTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

const scalar = csharpSourcePrimitiveTargetType("int32");
const callable = csharpDelegateTargetType("System.Func", [scalar], scalar);
const sequence = { kind: "array", element: scalar };
const declared = csharpNullableTargetType(csharpRuntimeUnionTargetType([callable, sequence]));

function inputs(options = {}) {
  const file = {};
  const argument = { expression: {}, type: {} };
  const binding = { sourceArgumentIndex: 0, effectiveArgumentIndex: 0, sourceParameterIndex: 0,
    sourceForm: "value", ...options.binding };
  const source = { sourceArguments: [argument], sourceArgumentBindings: options.bindings ?? [binding],
    sourceSelectedSignatureParameters: [{ parameterIndex: options.parameterIndex ?? 0 }] };
  let reads = 0;
  const host = {
    ast: { is: { IsSpreadElement: () => false } },
    semantics: () => ({ types: { isNumberLike: () => false,
      callable: type => type === argument.type && options.callable !== false ? {} : undefined } }),
    types: { resolveSelectedValue: () => undefined, resolveType: () => undefined, resolveNode: () => undefined,
      resolveSourceCallTypeArguments: () => [],
      resolveSourceCallParameter: (selected, index, selectedFile, domain) => {
        assert.equal(selected === source && selectedFile === file && index === 0, true, "same selected declared parameter");
        assert.equal(domain, "declared", "the selected profile owns a declared read, not source-callee admission");
        reads++;
        return options.declared ?? declared;
      } },
  };
  const value = createCsharpSourceProfileInputs(host, file, options.foreign ? [] : [argument], undefined, [], {}, source);
  assert.equal(reads, 1, "one native parameter read, no raw reselection");
  return value.parameters[0];
}

test("checked callable input projects the unique declared native union arm without a finished body carrier", () => {
  assert.equal(inputs() === callable, true, "the original declared native delegate, not a guessed body signature");
});

test("declared callable union projection refuses foreign, ambiguous and spread binding correspondence", () => {
  for (const options of [{ foreign: true }, { parameterIndex: 1 },
    { binding: { sourceArgumentIndex: 1 } }, { binding: { effectiveArgumentIndex: -1 } },
    { binding: { sourceForm: "spread-element" } }, { binding: { sourceForm: "spread-sequence" } },
    { bindings: [{ sourceParameterIndex: 0 }, { sourceParameterIndex: 0 }] }]) {
    assert.equal(inputs(options) === undefined, true, "unproven original checked correspondence refuses");
  }
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
