import assert from "node:assert/strict";
import test from "node:test";
import { dotnetTypeRefToTargetTypeRef, validateDotnetModuleModelContract } from "../../../../dist/public/provider-dotnet.js";
import { getCsharpDelegateSignature, getCsharpLambdaSignature } from "../../../../dist/target-model/types/index.js";
import { substituteTargetTypeParameters } from "../../../../dist/public/provider.js";
import { csharpApplyExternAliasToTargetType } from "../../../../dist/policy/types/project/extern-aliases.js";

const parameter = { kind: "type-parameter", identity: "Fixture:0", name: "T" };
const signature = { kind: "function", id: "Fixture::Selector.Invoke", parameters: [
  { name: "value", type: parameter, passingMode: "by-value" },
], returnType: parameter };
const delegate = { kind: "named", targetId: "Fixture::Selector`1", metadataName: "Selector`1",
  callableRepresentation: "delegate", typeArguments: [parameter], sourceShape: signature };
const quotation = { kind: "named", targetId: "Fixture::Quotation`1", metadataName: "Quotation`1",
  callableRepresentation: "expression-tree", typeArguments: [structuredClone(delegate)], sourceShape: structuredClone(signature) };
const model = type => ({ moduleSpecifier: "@fixture/native/Test.js", namespaceName: "Fixture", exports: [
  { kind: "value", sourceName: "selected", targetId: "Fixture::selected", metadataName: "selected", type },
] });

test("quotation keeps one actual delegate signature through generic substitution and alias transport", () => {
  assert.equal(validateDotnetModuleModelContract(model(quotation)), undefined);
  const selected = dotnetTypeRefToTargetTypeRef(quotation);
  assert.equal(getCsharpDelegateSignature(selected), undefined);
  assert.equal(getCsharpLambdaSignature(selected).parameters[0].identity, parameter.identity);
  const closed = substituteTargetTypeParameters(selected, new Map([[parameter.identity, { kind: "source-primitive", name: "int64" }]]));
  assert.equal(getCsharpLambdaSignature(closed).returnType.name, "int64");
  assert.deepEqual(closed.csharpExpressionTreeDelegateType, closed.typeArguments[0]);
  const aliased = csharpApplyExternAliasToTargetType(closed, { alias: "Selected", assemblyName: "Fixture" });
  assert.deepEqual(aliased.csharpExpressionTreeDelegateType, aliased.typeArguments[0]);
});

for (const [name, mutate] of [
  ["missing physical evidence", value => { delete value.callableRepresentation; }],
  ["unknown physical representation", value => { value.callableRepresentation = "adapter"; }],
  ["missing delegate argument", value => { value.typeArguments = []; }],
  ["extra delegate argument", value => { value.typeArguments.push(structuredClone(delegate)); }],
  ["non-delegate argument", value => { value.typeArguments[0].callableRepresentation = "expression-tree"; }],
  ["different native width", value => { value.typeArguments[0].sourceShape.returnType = { kind: "source-primitive", name: "uint64" }; }],
  ["different passing mode", value => { value.typeArguments[0].sourceShape.parameters[0].passingMode = "byref-readwrite"; }],
  ["different optionality", value => { value.typeArguments[0].sourceShape.parameters[0].optional = true; }],
  ["non-function source shape", value => { value.sourceShape = { kind: "string" }; }],
]) {
  test(`native quotation contract rejects ${name}`, () => {
    const value = structuredClone(quotation);
    mutate(value);
    const diagnostic = validateDotnetModuleModelContract(model(value));
    assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", name);
  });
}

test("direct public target projection also rejects a missing physical callable relationship", () => {
  const value = structuredClone(quotation);
  delete value.callableRepresentation;
  assert.throws(() => dotnetTypeRefToTargetTypeRef(value), /exact native delegate or expression-tree representation/u);
  const mismatched = structuredClone(quotation);
  mismatched.typeArguments[0].sourceShape.returnType = { kind: "source-primitive", name: "uint64" };
  assert.throws(() => dotnetTypeRefToTargetTypeRef(mismatched), /exact native delegate argument/u);
});

test("open native quotation keeps the delegate parameter identity until exact substitution", () => {
  const value = { ...quotation, typeArguments: [parameter], sourceShape: parameter };
  assert.equal(validateDotnetModuleModelContract(model(value)), undefined);
  const open = dotnetTypeRefToTargetTypeRef(value);
  assert.equal(getCsharpLambdaSignature(open), undefined, "no invented signature for an unresolved delegate parameter");
  const closed = substituteTargetTypeParameters(open, new Map([[parameter.identity, dotnetTypeRefToTargetTypeRef(delegate)]]));
  assert.equal(getCsharpLambdaSignature(closed).parameters.length, 1);
  assert.deepEqual(closed.csharpExpressionTreeDelegateType, closed.typeArguments[0]);
  assert.equal(validateDotnetModuleModelContract(model({ ...value, sourceShape: { ...parameter, identity: "Other:0" } }))?.code,
    "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
});
