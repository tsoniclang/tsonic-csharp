// Closed class-union calls (`(Left | Right).value(x)`): the Host per-arm relation at the call names each arm's method
// (nextgen C-2542, R1); C# checks only native signatures, passing modes, omission/rest slots and the result join.
// Basis for the port: AGENT-D1-NOTES.md §1 (selections.call, relations.at, sums.substitute) and D1-F2 notes.
import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpUnionCall } from "../../../dist/analysis/operations/union-calls.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function fixture() {
  const access = {};
  const receiver = {};
  const call = {};
  const name = {};
  const integer = csharpSourcePrimitiveTargetType("int64");
  const incoming = csharpNullableTargetType(integer);
  const arms = [csharpTargetNamedType("Left", undefined, undefined, { allowsRefLikeTypeArguments: [] }),
    csharpTargetNamedType("Right", undefined, undefined, { allowsRefLikeTypeArguments: [] })];
  const owners = [{}, {}];
  const parameters = [{ Initializer: {} }, { Initializer: {} }];
  const declarations = parameters.map(parameter => ({ parameter }));
  const signatures = declarations.map(() => csharpDelegateTargetType("System.Func", [incoming], integer,
    { optionalParameterIndexes: [0] }));
  // Host descriptors: each arm is its class; each method's published type is its own callable descriptor.
  const armDescriptors = owners.map(owner => ({ kind: "declared", declaration: owner, typeArguments: [] }));
  const methodTypes = declarations.map(declaration => ({ kind: "callable", calls: [], constructs: [], method: declaration }));
  const parameterDescriptor = { kind: "optional", value: { kind: "primitive", primitive: "int64" } };
  const slot = { declaration: parameters[0], kind: "optional" };
  const source = { use: call, callee: access, arguments: [], parameters: [parameterDescriptor],
    signatureParameters: [slot], result: { kind: "primitive", primitive: "int64" }, optionalChain: false };
  const union = csharpRuntimeUnionTargetType(arms);
  const relation = { kind: "per-arm", use: call, sum: {}, arms: [{ arm: 0, member: declarations[0] }, { arm: 1, member: declarations[1] }] };
  const facts = {
    relations: { at: use => use === call ? relation : undefined },
    selections: {
      memberAccess: node => node === access ? { use: access, receiver, receiverType: { kind: "union" }, optionalChain: false } : undefined,
    },
    analyses: { propertyName: node => node === name ? { kind: "resolved", name: "value", constant: undefined } : undefined },
    sums: { sum: () => ({ arms: armDescriptors.map((type, role) => ({ role, type })), roles: [] }), substitute: type => type },
    values: { slot: declaration => ({ kind: "slot", slot: declaration, type: methodTypes[declarations.indexOf(declaration)],
      broad: false, authority: "declared" }) },
  };
  const represent = descriptor => {
    if (descriptor === parameterDescriptor) return incoming;
    if (descriptor.kind === "union") return union;
    const arm = armDescriptors.indexOf(descriptor);
    if (arm >= 0) return arms[arm];
    const method = methodTypes.indexOf(descriptor);
    if (method >= 0) return signatures[method] ?? { kind: "csharp-refused", code: "CSHARP_CALLABLE_OVERLOADS", message: "no delegate", site: descriptor.method };
    return assert.fail("Only Host descriptors of this call are represented.");
  };
  const policy = {
    ast: { is: { IsPropertyAccessExpression: subject => subject === access, IsMethodDeclaration: subject => declarations.includes(subject) },
      hasModifierKind: () => false, name: () => name, parameters: declaration => [declaration.parameter],
      typeParameters: () => [], parent: subject => owners[declarations.indexOf(subject)],
      as: { AsParameterDeclaration: parameter => parameter } },
    facts,
    types: { represent, value: node => node === call ? integer : assert.fail("Only the call value is read."), instantiation: () => undefined },
    projectTypes: { catalog: { definitionForTarget: target => ({ kind: "class", declaration: owners[arms.indexOf(target)] }) } },
  };
  return { policy, source, relation, signatures, integer, incoming, slot, parameters, declarations, arms,
    select: () => classifyCsharpUnionCall(policy, source) };
}

test("closed union dispatch takes each arm's method from the Host per-arm relation, in Host arm order", () => {
  const input = fixture();
  const result = input.select();
  assert.equal(result.kind, "resolved");
  assert.equal(result.methods.length, 2);
  assert.equal(result.parameterTypes[0] === input.incoming, true);
  assert.equal(result.methods.every((method, index) => method.declaration === input.declarations[index] &&
    method.arm === input.arms[index] && method.targetName === "value"), true);
  assert.equal(Object.isFrozen(result.methods) && Object.isFrozen(result.parameterTypes), true);
});

test("a call without a Host per-arm relation is not a union call", () => {
  const input = fixture();
  input.policy.facts.relations.at = () => undefined;
  assert.equal(input.select().kind, "not-union");
});

const invalidSignatures = [
  ["unrepresentable arm method", input => { input.signatures[1] = undefined; }],
  ["lost incoming absence", input => { input.signatures[1].csharpDelegateSignature.parameters = [input.integer]; }],
  ["integer width mismatch", input => {
    input.signatures[1].csharpDelegateSignature.parameters = [csharpNullableTargetType(csharpSourcePrimitiveTargetType("int32"))];
  }],
  ["integer versus float", input => {
    input.signatures[1].csharpDelegateSignature.parameters = [csharpNullableTargetType(csharpSourcePrimitiveTargetType("float64"))];
  }],
  ["native parameter count mismatch", input => { input.signatures[1].csharpDelegateSignature.parameters = []; }],
  ["passing mode count mismatch", input => { input.signatures[1].csharpDelegateSignature.parameterPassingModes = []; }],
  ["shared by-reference input", input => { input.signatures[1].csharpDelegateSignature.parameterPassingModes = ["byref-readonly"]; }],
  ["by-reference return", input => { input.signatures[1].csharpDelegateSignature.returnPassing = "byref-readonly"; }],
  ["missing omission contract", input => { delete input.signatures[1].csharpDelegateSignature.optionalParameterIndexes; }],
  ["unexpected native rest slot", input => { input.signatures[1].csharpDelegateSignature.restParameterIndex = 0; }],
  ["source and native rest disagreement", input => {
    input.source.signatureParameters = [{ ...input.slot, kind: "rest" }];
    for (const parameter of input.parameters) parameter.DotDotDotToken = {};
  }],
  ["result width mismatch", input => { input.signatures[1].csharpDelegateSignature.returnType = csharpSourcePrimitiveTargetType("int32"); }],
  ["static method is not an instance arm", input => { input.policy.ast.hasModifierKind = () => true; }],
  ["arm without a Host member", input => { input.relation.arms = [input.relation.arms[0], { arm: 1 }]; }],
];

for (const [name, mutate] of invalidSignatures) {
  test(`closed union contracts reject ${name}`, () => {
    const input = fixture();
    mutate(input);
    assert.equal(input.select().kind, "rejected", name);
  });
}

test("native rest contracts follow the Host signature slot, not initializer syntax", () => {
  const input = fixture();
  const array = { kind: "array", element: input.integer };
  input.policy.types.represent = (represent => descriptor => descriptor === input.source.parameters[0] ? array : represent(descriptor))(
    input.policy.types.represent);
  input.source.signatureParameters = [{ ...input.slot, kind: "rest" }];
  for (const parameter of input.parameters) {
    delete parameter.Initializer;
    parameter.DotDotDotToken = {};
  }
  for (const signature of input.signatures) {
    signature.csharpDelegateSignature.parameters = [array];
    signature.csharpDelegateSignature.restParameterIndex = 0;
    delete signature.csharpDelegateSignature.optionalParameterIndexes;
  }
  assert.equal(input.select().kind, "resolved");
});
