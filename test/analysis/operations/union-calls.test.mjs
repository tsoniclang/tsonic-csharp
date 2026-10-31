import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpUnionCall } from "../../../dist/analysis/operations/union-calls.js";
import { selectCsharpUnionCallMethods } from "../../../dist/analysis/source-evidence/types/resolution/union-call-methods.js";
import { resolveSourceCallResultWithState } from "../../../dist/analysis/source-evidence/types/resolution/call-api.js";
import { csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function fixture() {
  const sourceFile = {};
  const access = {};
  const receiver = {};
  const selectedSymbol = {};
  const integer = csharpSourcePrimitiveTargetType("int64");
  const incoming = csharpNullableTargetType(integer);
  const arms = [csharpTargetNamedType("Left", undefined, undefined, { allowsRefLikeTypeArguments: [],}), csharpTargetNamedType("Right", undefined, undefined, { allowsRefLikeTypeArguments: [],})];
  const owners = [{}, {}];
  const name = {};
  const parameters = [{ Initializer: {} }, { Initializer: {} }];
  const declarations = parameters.map(parameter => ({ parameter }));
  const parameterSymbols = parameters.map(declaration => ({ declaration }));
  const checkedSignatures = parameterSymbols.map(parameter => ({ parameters: [parameter] }));
  const signatures = declarations.map(() => csharpDelegateTargetType("System.Func", [incoming], integer,
    { optionalParameterIndexes: [0] }));
  const selected = { parameterDeclaration: parameters[0], acceptsOmission: true, rest: false };
  const source = { sourceCallee: { expression: access }, sourceArguments: [],
    sourceSelectedSignatureParameters: [selected] };
  const union = csharpRuntimeUnionTargetType(arms);
  const semantics = { operations: { propertyAccess: () => ({ receiver: { expression: receiver, type: {} },
      selectedSymbol, selectedDeclaration: declarations[0], optionalChain: false }) },
    types: { propertyInfos: () => [] },
    declarations: {
      declarationSignature: declaration => checkedSignatures[declarations.indexOf(declaration)],
      signatureParameters: signature => signature.parameters,
      primarySymbolDeclaration: symbol => symbol.declaration,
    },
    facts: { selectedSubjects: () => declarations },
    propertyNames: { get: subject => subject === name ? { kind: "resolved", name: "value" } : undefined } };
  const policy = {
    ast: { is: { IsPropertyAccessExpression: subject => subject === access,
        IsParameterDeclaration: subject => parameters.includes(subject),
        IsIdentifier: subject => subject === name },
      kind: () => 1, kindName: () => "KindMethodDeclaration", hasModifierKind: () => false,
      name: () => name, text: () => "value", parameters: declaration => [declaration.parameter],
      getSourceFile: () => sourceFile, typeParameters: () => [],
      parent: subject => owners[declarations.indexOf(subject)],
      as: { AsParameterDeclaration: parameter => parameter } },
    semantics: () => semantics,
    semanticsFor: () => semantics,
    navigation: { isProjectDeclaration: () => true },
    types: { resolveSelectedValue: () => union, resolveSourceCallParameter: (_source, _index, _file, domain) => {
        assert.equal(domain, "callable", "union calls retain source-callee admission");
        return incoming;
      },
      resolveSourceCallResult: () => ({ selectedType: integer }), resolveSourceCallTypeArguments: () => [],
      resolveNode: declaration => { const type = signatures[declarations.indexOf(declaration)];
        return type === undefined ? undefined : { kind: "resolved", type }; },
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
  input.policy.types.resolveSourceCallParameter = (_source, _index, _file, domain) => {
    assert.equal(domain, "callable", "rest inputs retain source-callee admission");
    return array;
  };
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

function sharedMethods(input, typeArguments) {
  const property = input.policy.semantics(input.sourceFile).operations.propertyAccess(input.source.sourceCallee.expression);
  const receiver = input.policy.types.resolveSelectedValue(property.receiver.expression, property.receiver.type, input.sourceFile);
  return selectCsharpUnionCallMethods(input.policy, property, getCsharpRuntimeUnionArms(receiver), typeArguments,
    (declaration, file) => {
      assert.equal(file === input.sourceFile && input.declarations.includes(declaration), true,
        "only the actual selected member and its own file resolve");
      return input.policy.types.resolveNode(declaration, file)?.type;
    });
}

test("one early union method owner supplies the same checked members and results to operation admission", () => {
  const input = fixture();
  const selected = sharedMethods(input, []);
  assert.equal(selected.kind, "resolved");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.methods), true);
  for (const [index, method] of selected.methods.entries()) {
    assert.equal(method.declaration === input.declarations[index] && method.parameters[0] === input.parameters[index], true);
    assert.equal(method.nativeParameters[0] === input.incoming && method.result.nativeType === input.integer, true);
    assert.equal(Object.isFrozen(method) && Object.isFrozen(method.nativeParameters) && Object.isFrozen(method.result), true);
  }
  const property = input.policy.semantics(input.sourceFile).operations.propertyAccess(input.source.sourceCallee.expression);
  input.source.sourceCalleeAccess = { kind: "property", expression: input.source.sourceCallee.expression, receiver: property.receiver };
  input.source.sourceSelectedSignatureKind = "resolved";
  const semantics = input.policy.semantics(input.sourceFile);
  semantics.operations.callResult = () => undefined;
  const scope = { host: { ...input.policy, projectTypes: () => input.policy.projectTypes },
    sourceCallSelectedDeclaration: () => input.declarations[0],
    resolveSelectedValueWithState: (...arguments_) => input.policy.types.resolveSelectedValue(...arguments_),
    resolveSourceCallInstantiation: () => ({ arguments: [] }),
    resolveNodeWithState: (declaration, file) => input.policy.types.resolveNode(declaration, file)?.type };
  const early = resolveSourceCallResultWithState(scope, input.source, input.sourceFile, { depth: 0 }, undefined);
  const operation = input.select();
  assert.equal(early.nativeType === input.integer && early.selectedType === input.integer, true);
  assert.equal(operation.kind === "resolved" && operation.resultType === early.selectedType, true);
  assert.equal(operation.methods.every((method, index) => method.declaration === selected.methods[index].declaration &&
    method.result.nativeType === selected.methods[index].result.nativeType), true);
});

test("shared union discovery deduplicates checked roots and terminates repeated ancestry", () => {
  const input = fixture();
  input.policy.semantics(input.sourceFile).facts.selectedSubjects = () => [...input.declarations, ...input.declarations];
  input.policy.projectTypes.directSupertypes = arm => [arm];
  const selected = sharedMethods(input, []);
  assert.equal(selected.kind === "resolved" && selected.methods.length === 2, true);
  assert.equal(input.select().kind, "resolved");
});

test("shared union discovery reads only selected checked symbol roots", () => {
  const input = fixture();
  const semantics = input.policy.semantics(input.sourceFile);
  const property = semantics.operations.propertyAccess(input.source.sourceCallee.expression);
  const root = {};
  const foreignRoot = {};
  semantics.facts.selectedSubjects = () => [];
  semantics.types.propertyInfos = () => [{ symbol: {}, rootSymbols: [foreignRoot] },
    { symbol: property.selectedSymbol, rootSymbols: [root] }];
  semantics.declarations.symbolDeclarations = symbol => {
    assert.equal(symbol === root, true, "an unselected root is never queried");
    return input.declarations;
  };
  assert.equal(sharedMethods(input, []).kind, "resolved");
  assert.equal(input.select().kind, "resolved");
  input.policy.navigation.isProjectDeclaration = () => false;
  assert.equal(sharedMethods(input, []).kind, "rejected");
  assert.equal(input.select().kind, "rejected");
});

test("shared union discovery rejects multiple actual methods for one ancestor owner", () => {
  const input = fixture();
  const extra = {};
  const containing = input.policy.projectTypes.catalog.definitionContainingDeclaration;
  input.policy.projectTypes.catalog.definitionContainingDeclaration = declaration =>
    containing(declaration === extra ? input.declarations[0] : declaration);
  input.policy.semantics(input.sourceFile).facts.selectedSubjects = () => [...input.declarations, extra];
  const selected = sharedMethods(input, []);
  const operation = input.select();
  assert.equal(selected.kind === "rejected" && selected.reason.includes("cardinality is 2"), true);
  assert.equal(operation.kind === "rejected" && operation.reason === selected.reason, true);
});

test("shared union discovery preserves exact selected generic argument counts", () => {
  const input = fixture();
  const selected = sharedMethods(input, [input.integer]);
  assert.equal(selected.kind === "rejected" && selected.reason.includes("selected count is 1"), true);
  input.policy.types.resolveSourceCallTypeArguments = () => [input.integer];
  assert.equal(input.select().kind, "rejected");
});

test("shared union discovery retains physical tasks and one source-bodied adoption completion", () => {
  const input = fixture();
  const inner = csharpTaskTargetType(input.integer);
  const physical = csharpTaskTargetType(inner);
  for (const signature of input.signatures) signature.csharpDelegateSignature.returnType = physical;
  input.policy.ast.body = () => ({});
  input.policy.types.resolveSourceCallResult = () => ({ nativeType: physical, selectedType: inner });
  const selected = sharedMethods(input, []);
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.methods.every(method => method.result.nativeType === physical && method.result.selectedType === inner &&
    method.result.completion !== undefined && Object.isFrozen(method.result)), true);
  assert.equal(input.select().kind, "resolved");
});

test("shared union discovery completes non-ambient bodyless selected declarations without reading bodies", () => {
  const input = fixture();
  const inner = csharpTaskTargetType(input.integer);
  const physical = csharpTaskTargetType(inner);
  for (const signature of input.signatures) signature.csharpDelegateSignature.returnType = physical;
  input.policy.ast.body = () => assert.fail("Adoption reads only the selected declaration and its ambient context");
  input.policy.types.resolveSourceCallResult = () => ({ nativeType: physical, selectedType: inner });
  const selected = sharedMethods(input, []);
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.methods.every(method => method.result.nativeType === physical && method.result.selectedType === inner &&
    method.result.completion !== undefined && Object.isFrozen(method.result)), true);
  assert.equal(input.select().kind, "resolved");
});

for (const scope of ["declaration", "containing declaration"]) {
  test(`shared union discovery preserves the native task layer for an ambient ${scope}`, () => {
    const input = fixture();
    const inner = csharpTaskTargetType(input.integer);
    const physical = csharpTaskTargetType(inner);
    for (const signature of input.signatures) signature.csharpDelegateSignature.returnType = physical;
    const declaration = input.declarations[1];
    const ambient = scope === "declaration" ? declaration : input.policy.ast.parent(declaration);
    assert.equal(ambient !== undefined, true);
    input.policy.ast.hasModifierKind = (subject, kind) => kind === "ambient" && subject === ambient;
    input.policy.ast.body = () => assert.fail("An ambient native signature never reads an implementation body");
    const selected = sharedMethods(input, []);
    assert.equal(selected.kind, "resolved");
    assert.equal(selected.methods[0].result.nativeType === physical && selected.methods[0].result.selectedType === inner &&
      selected.methods[0].result.completion !== undefined && Object.isFrozen(selected.methods[0].result), true);
    assert.equal(selected.methods[1].result.nativeType === physical && selected.methods[1].result.selectedType === physical &&
      selected.methods[1].result.completion === undefined && Object.isFrozen(selected.methods[1].result), true);
  });
}

test("shared union discovery refuses missing native result instantiation without another selector", () => {
  const input = fixture();
  input.policy.projectTypes.instantiateMemberType = () => ({ kind: "unavailable" });
  const selected = sharedMethods(input, []);
  assert.equal(selected.kind === "rejected" && selected.reason.includes("exact instantiated native result"), true);
  assert.equal(input.select().kind, "rejected");
});
