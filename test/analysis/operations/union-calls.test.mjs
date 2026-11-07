// Closed class-union calls (`(Left | Right).value(x)`): the Host per-arm relation at the callee property access names
// each arm's method and its instantiated member type (nextgen C-2542, R1; facts.ts per-arm "at the property access");
// C# checks only native signatures, passing modes, omission/rest slots, the result join and call-site Promise adoption.
// Basis for the port: AGENT-D1-NOTES.md §1 (selections.call, relations.at, sums.substitute) and D1-F2 notes.
import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpUnionCall } from "../../../dist/analysis/operations/union-calls.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";

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
  // The Host publishes per-arm at the property or element access (relations.ts perArm), never at the call node.
  const relation = { kind: "per-arm", use: access, sum: {}, arms: declarations.map((member, arm) => ({ arm, member, type: methodTypes[arm] })) };
  const facts = {
    relations: { at: use => use === access ? relation : undefined },
    selections: {
      memberAccess: node => node === access ? { use: access, receiver, receiverType: { kind: "union" }, optionalChain: false } : undefined,
    },
    analyses: { propertyName: node => node === name ? { kind: "resolved", name: "value", constant: undefined } : undefined },
    sums: { sum: () => ({ arms: armDescriptors.map((type, role) => ({ role, type })), roles: [] }), substitute: type => type },
    values: { slot: () => assert.fail("The arm member type is the per-arm relation's published `type`, not a C# slot read.") },
    navigation: { identity: { isProjectDeclaration: () => true } },
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
    types: { represent, value: node => node === call ? integer : assert.fail("Only the call value is read."), instantiation: () => undefined,
      awaited: node => node === call ? integer : assert.fail("Only the call's Host awaited result is read.") },
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

test("the per-arm relation is read at the callee property access, never at the call node", () => {
  const input = fixture();
  const relation = input.relation;
  const call = input.source.use;
  input.policy.facts.relations.at = use => use === call ? relation : undefined;
  assert.equal(input.select().kind, "not-union", "a relation keyed by the call node is not the Host contract");
});

test("an arm method without its published per-arm member type is an invariant failure", () => {
  const input = fixture();
  input.relation.arms = [input.relation.arms[0], { arm: 1, member: input.declarations[1] }];
  assert.throws(() => input.select(), /requires its published member type/);
});

const invalidSignatures = [
  ["unrepresentable arm method", input => { input.signatures[1] = undefined; }],
  ["lost incoming absence", input => { input.signatures[1].csharpDelegateSignature.parameters = [input.integer]; }],
  ["integer width mismatch", input => {
    input.signatures[1].csharpDelegateSignature.parameters = [csharpNullableTargetType(csharpSourcePrimitiveTargetType("int32"))];
  }],
  ["integer signedness mismatch", input => {
    input.signatures[1].csharpDelegateSignature.parameters = [csharpNullableTargetType(csharpSourcePrimitiveTargetType("uint64"))];
  }],
  ["integer versus float", input => {
    input.signatures[1].csharpDelegateSignature.parameters = [csharpNullableTargetType(csharpSourcePrimitiveTargetType("float64"))];
  }],
  ["native parameter count mismatch", input => { input.signatures[1].csharpDelegateSignature.parameters = []; }],
  ["passing mode count mismatch", input => { input.signatures[1].csharpDelegateSignature.parameterPassingModes = []; }],
  ["shared by-reference input", input => { input.signatures[1].csharpDelegateSignature.parameterPassingModes = ["byref-readonly"]; }],
  ["mutable by-reference input", input => { input.signatures[1].csharpDelegateSignature.parameterPassingModes = ["byref-readwrite"]; }],
  ["write-only input", input => { input.signatures[1].csharpDelegateSignature.parameterPassingModes = ["byref-writeonly-must-init"]; }],
  ["unrecognized passing mode", input => { input.signatures[1].csharpDelegateSignature.parameterPassingModes = ["borrow"]; }],
  ["by-reference return", input => { input.signatures[1].csharpDelegateSignature.returnPassing = "byref-readonly"; }],
  ["missing omission contract", input => { delete input.signatures[1].csharpDelegateSignature.optionalParameterIndexes; }],
  ["unexpected native rest slot", input => { input.signatures[1].csharpDelegateSignature.restParameterIndex = 0; }],
  ["source and native rest disagreement", input => {
    input.source.signatureParameters = [{ ...input.slot, kind: "rest" }];
    for (const parameter of input.parameters) parameter.DotDotDotToken = {};
  }],
  ["result width mismatch", input => { input.signatures[1].csharpDelegateSignature.returnType = csharpSourcePrimitiveTargetType("int32"); }],
  ["static method is not an instance arm", input => { input.policy.ast.hasModifierKind = () => true; }],
  ["arm without a Host member", input => { input.relation.arms = [input.relation.arms[0], { arm: 1, type: input.relation.arms[1].type }]; }],
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

// Call-site Promise adoption (C-1373): a physical Task<Task<T>> arm result unwraps at the call; the joined call result is
// adopted the same way, so the join and each arm agree. The continuation result is the Host awaited result of the call.
test("closed union arms keep call-site Promise adoption of a nested physical Task result", () => {
  const input = fixture();
  const inner = csharpTaskTargetType(input.integer);
  const physical = csharpTaskTargetType(inner);
  for (const signature of input.signatures) signature.csharpDelegateSignature.returnType = physical;
  input.policy.types.value = node => node === input.source.use ? physical : assert.fail("Only the call value is read.");
  const result = input.select();
  assert.equal(result.kind, "resolved");
  assert.equal(result.resultType === inner, true, "the joined result is the unwrapped payload Task");
  assert.equal(result.methods.every(method => method.result.nativeType === physical && method.result.selectedType === inner &&
    method.result.completion?.form === "direct" && Object.isFrozen(method.result)), true);
});

test("an ambient arm keeps its native Task layer without adoption", () => {
  const input = fixture();
  const inner = csharpTaskTargetType(input.integer);
  const physical = csharpTaskTargetType(inner);
  for (const signature of input.signatures) signature.csharpDelegateSignature.returnType = physical;
  input.policy.types.value = node => node === input.source.use ? physical : assert.fail("Only the call value is read.");
  input.policy.ast.hasModifierKind = (subject, kind) => kind === "ambient" && input.declarations.includes(subject);
  const result = input.select();
  assert.equal(result.kind, "resolved");
  assert.equal(result.methods.every(method => method.result.selectedType === physical && method.result.completion === undefined), true);
});

test("a single-Task arm result is not adopted", () => {
  const input = fixture();
  const task = csharpTaskTargetType(input.integer);
  for (const signature of input.signatures) signature.csharpDelegateSignature.returnType = task;
  input.policy.types.value = node => node === input.source.use ? task : assert.fail("Only the call value is read.");
  input.policy.types.awaited = () => assert.fail("No adoption reads the awaited result of a single Task.");
  const result = input.select();
  assert.equal(result.kind, "resolved");
  assert.equal(result.methods.every(method => method.result.completion === undefined && method.result.selectedType === task), true);
});
