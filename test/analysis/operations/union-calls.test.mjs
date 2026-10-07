import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpUnionCall } from "../../../dist/analysis/operations/union-calls.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/scalar-types.js";

function fixture() {
  const sourceFile = {};
  const access = {};
  const receiver = {};
  const selectedSymbol = {};
  const integer = csharpSourcePrimitiveTargetType("int64");
  const incoming = csharpNullableTargetType(integer);
  const arms = [csharpTargetNamedType("Left"), csharpTargetNamedType("Right")];
  const owners = [{}, {}];
  const name = {};
  const parameters = [{ Initializer: {} }, { Initializer: {} }];
  const declarations = parameters.map(parameter => ({ parameter }));
  const signatures = declarations.map(() => csharpDelegateTargetType("System.Func", [incoming], integer,
    { optionalParameterIndexes: [0] }));
  const selected = { parameterDeclaration: parameters[0], acceptsOmission: true, rest: false };
  const source = { sourceCallee: { expression: access }, sourceArguments: [],
    sourceSelectedSignatureParameters: [selected] };
  const union = csharpRuntimeUnionTargetType(arms);
  const semantics = { operations: { propertyAccess: () => ({ receiver: { expression: receiver, type: {} },
      selectedSymbol, selectedDeclaration: declarations[0], optionalChain: false }) },
    types: { propertyInfos: () => [] }, facts: { selectedSubjects: () => declarations } };
  const policy = {
    ast: { is: { IsPropertyAccessExpression: subject => subject === access,
        IsIdentifier: subject => subject === name },
      kind: () => 1, kindName: () => "KindMethodDeclaration", hasModifierKind: () => false,
      name: () => name, text: () => "value", parameters: declaration => [declaration.parameter],
      getSourceFile: () => sourceFile, typeParameters: () => [],
      as: { AsParameterDeclaration: parameter => parameter } },
    semantics: () => semantics,
    navigation: { isProjectDeclaration: () => true },
    types: { resolveSelectedValue: () => union, resolveSourceCallParameter: () => incoming,
      resolveSourceCallResult: () => ({ selectedType: integer }), resolveSourceCallTypeArguments: () => [],
      resolveNode: declaration => signatures[declarations.indexOf(declaration)],
      resolveStorage: () => assert.fail("Body-local storage is not a native incoming parameter contract") },
    projectTypes: { catalog: {
        definitionForTarget: target => ({ kind: "class", declaration: owners[arms.indexOf(target)] }),
        definitionContainingDeclaration: declaration => ({ declaration: owners[declarations.indexOf(declaration)] }),
      }, directSupertypes: () => [], instantiateMemberType: (_member, _owner, type) => ({ kind: "resolved", type }) },
  };
  return { policy, source, sourceFile, signatures, integer, incoming, selected, parameters, declarations,
    select: () => classifyCsharpUnionCall(policy, source, sourceFile) };
}

test("closed union dispatch consumes canonical incoming defaults without reading body-local storage", () => {
  const input = fixture();
  const result = input.select();
  assert.equal(result.kind, "resolved");
  assert.equal(result.methods.length, 2);
  assert.equal(result.parameterTypes[0] === input.incoming, true);
  assert.equal(result.methods.every((method, index) => method.declaration === input.declarations[index]), true);
  assert.equal(Object.isFrozen(result.methods), true);
  assert.equal(Object.isFrozen(result.parameterTypes), true);
});

const invalidSignatures = [
  ["absent signature", input => { input.signatures[1] = undefined; }],
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
    input.selected.rest = true;
    for (const parameter of input.parameters) parameter.DotDotDotToken = {};
  }],
  ["result width mismatch", input => { input.signatures[1].csharpDelegateSignature.returnType = csharpSourcePrimitiveTargetType("int32"); }],
  ["missing declaration file", input => { input.policy.ast.getSourceFile = () => undefined; }],
  ["static method is not an instance arm", input => { input.policy.ast.hasModifierKind = () => true; }],
  ["method belongs to another owner", input => { input.policy.projectTypes.catalog.definitionContainingDeclaration = () => ({ declaration: {} }); }],
];

for (const [name, mutate] of invalidSignatures) {
  test(`closed union contracts reject ${name}`, () => {
    const input = fixture();
    mutate(input);
    assert.equal(input.select().kind, "rejected", name);
  });
}

test("native rest and optional contracts remain independent from initializer syntax", () => {
  const input = fixture();
  const array = { kind: "array", element: input.integer };
  input.policy.types.resolveSourceCallParameter = () => array;
  input.selected.rest = true;
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
