import {
  assert,
  callEvidence,
  providerCallSource,
  providerCallNativeEvidence,
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  directProviderHost,
  passingFact,
  providerBinding,
  providerConstructor,
  providerDeclaration,
  providerFact,
  providerMethod,
  selectCsharpProviderCall,
  selectCsharpTargetCall,
  signatureRelation,
  targetParameter,
  test,
} from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { instantiateCsharpProviderCall } from "../../../dist/analysis/operations/members/calls/instantiation.js";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import {
  csharpNullableReferenceTargetType,
  csharpNullableValueTargetType,
  csharpTargetNamedType,
  getCsharpNullableElementTargetType,
} from "../../../dist/policy/types/index.js";

test("rest arguments retain one declared parameter identity and target params slot", () => {
  const fixture = createCallFixture({
    sourceParameters: [{ rest: true }],
    sourceArgumentTargets: [
      csharpStringTargetType(),
      csharpStringTargetType(),
    ],
    targetParameters: [
      targetParameter("values", csharpStringTargetType(), {
        paramsArray: true,
      }),
    ],
    sourceParametersRelations: [
      parameterRelation({
        sourceRest: true,
        targetParamsArray: true,
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(
    selected.call.arguments.map((argument) => argument.targetParameterIndex),
    [0, 0],
  );
  const declaration = fixture.host.semantics(fixture.sourceFile).declarations.signatureDeclaration(fixture.source.selectedSignature);
  assert.equal(fixture.source.sourceSelectedSignatureParameters.length === 1 &&
    fixture.source.sourceSelectedSignatureParameters[0].rest === true &&
    fixture.source.sourceSelectedSignatureParameters[0].parameterDeclaration === fixture.host.ast.parameters(declaration)[0] &&
    fixture.source.sourceArgumentBindings.length === 2 &&
    fixture.source.sourceArgumentBindings.every(binding => binding.sourceParameterIndex === 0 && binding.sourceParameterForm === "rest-element"), true,
  "both actual checked argument bindings retain the one original authored rest parameter");
});

test("byref parameter modes require the exact finalized source parameter fact", () => {
  const target = {
    ...targetParameter("value", csharpStringTargetType()),
    passingMode: "byref-readwrite",
  };
  const fixture = createCallFixture({
    sourceArgumentTargets: [csharpObjectTargetType()],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-readwrite",
        targetPassingMode: "byref-readwrite",
      }),
    ],
    nativeEvidence: source => byrefNativeEvidence(source, "byref-readwrite", csharpStringTargetType()),
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(
    selected.call.targetMember.parameters[0].passingMode,
    "byref-readwrite",
  );
});

test("missing byref source facts cannot be inferred from target parameter mode", () => {
  const target = {
    ...targetParameter("value", csharpStringTargetType()),
    passingMode: "byref-readwrite",
  };
  const fixture = createCallFixture({
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-readwrite",
        targetPassingMode: "byref-readwrite",
      }),
    ],
    nativeEvidence: source => byrefNativeEvidence(source, "byref-readwrite", undefined, false),
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.match(selected.reason, /uses 'by-value'.*requires 'byref-readwrite'/u);
});

test("byref arguments reject implicit storage conversions", () => {
  const target = {
    ...targetParameter(
      "value",
      csharpSourcePrimitiveTargetType("int32"),
    ),
    passingMode: "byref-writeonly-must-init",
  };
  const fixture = createCallFixture({
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("float64")],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-writeonly-must-init",
        targetPassingMode: "byref-writeonly-must-init",
      }),
    ],
    nativeEvidence: source => byrefNativeEvidence(source, "byref-writeonly-must-init", csharpSourcePrimitiveTargetType("uint8")),
  });

  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );

  assert.equal(selected.kind, "missing");
  assert.match(
    selected.reason,
    /cannot satisfy exact target parameter 'value' with passing mode 'byref-writeonly-must-init'/u,
  );
});

test("byref arguments use CLR storage identity across nullable-reference annotations", () => {
  const todo = csharpTargetNamedType("Example.Todo", undefined, undefined, { allowsRefLikeTypeArguments: [],});
  const nullableTodo = csharpNullableReferenceTargetType(todo);
  const target = {
    ...targetParameter("value", todo),
    passingMode: "byref-writeonly-must-init",
    csharpOutputMayBeNull: true,
  };
  const fixture = createCallFixture({
    sourceArgumentTargets: [nullableTodo],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-writeonly-must-init",
        targetPassingMode: "byref-writeonly-must-init",
      }),
    ],
    nativeEvidence: source => byrefNativeEvidence(source, "byref-writeonly-must-init", nullableTodo),
  });

  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );

  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.argumentMappings, [{
    kind: "by-reference",
    effectiveArgumentIndex: 0,
    sourceType: nullableTodo,
    targetType: todo,
    passingMode: "byref-writeonly-must-init",
    proof: "storage-identity",
  }]);
});

test("selected method type arguments close generic target methods directly", () => {
  const typeParameter = { identity: "T", name: "T" };
  const method = providerMethod({
    id: "Fixture.Target.Identity``1(T)",
    parameters: [
      targetParameter("value", { kind: "type-parameter", identity: "T", name: "T" }),
    ],
    returnType: { kind: "type-parameter", identity: "T", name: "T" },
    typeParameters: [typeParameter],
  });
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const fixture = createCallFixture({
    member: method,
    targetParameters: method.parameters,
    sourceArgumentTargets: [int32],
    nativeTypeArguments: [{ selectedTarget: csharpStringTargetType(), explicitTarget: int32 }],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  const argument = selected.call.targetMethodTypeArguments[0];
  assert.equal(selected.call.targetMethodTypeArguments.length === 1 && argument.kind === "selected-source" &&
    argument.selectedType === fixture.source.sourceSelectedMethodTypeArguments[0].selectedType &&
    argument.explicitTypeNode === fixture.source.sourceSelectedMethodTypeArguments[0].explicitTypeNode, true,
  "the selected Native argument retains both original checked Type and authored-node identities");
  assert.deepEqual(argument.targetType, int32);
  assert.deepEqual(selected.call.targetMember.parameters[0].type, int32);
  assert.deepEqual(selected.call.targetMember.returnType, int32);
});

test("published provider arguments validate implicit native bounds independent of argument order", () => {
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const uint32 = csharpSourcePrimitiveTargetType("uint32");
  const int64 = csharpSourcePrimitiveTargetType("int64");
  const float64 = csharpSourcePrimitiveTargetType("float64");
  const cases = [
    [[int32, float64], float64],
    [[float64, int32], float64],
    [[int32, uint32, int64], int64],
    [[uint32, int32, int64], int64],
    [[int64, int32, uint32], int64],
    [[int32, int32], int32],
    [[float64, csharpNullableValueTargetType(int32)], csharpNullableValueTargetType(float64)],
    [[csharpNullableValueTargetType(int32), float64], csharpNullableValueTargetType(float64)],
  ];
  for (const [sourceArgumentTargets, expected] of cases) {
    const parameterType = { kind: "type-parameter", identity: "T", name: "T" };
    const method = providerMethod({
      parameters: sourceArgumentTargets.map((_, index) => targetParameter(`value${index}`, parameterType)),
      returnType: parameterType,
      typeParameters: [{ identity: "T", name: "T" }],
    });
    const fixture = createCallFixture({
      member: method,
      targetParameters: method.parameters,
      sourceArgumentTargets,
      nativeTypeArguments: [{ selectedTarget: expected }],
    });
    const publication = fixture.host.effectiveTypes.callInstantiation(fixture.call);
    const declaration = fixture.host.semantics(fixture.sourceFile).declarations.signatureDeclaration(fixture.source.selectedSignature);
    assert.equal(publication?.method.length === 1 &&
      publication.method[0].declaration === fixture.host.ast.typeParameters(declaration)[0], true,
    "the one published argument belongs to the exact selected Source declaration binder");
    const nullable = getCsharpNullableElementTargetType(expected);
    const argument = sourceTypeDescriptorStructure(publication.method[0].type);
    const value = nullable === undefined ? argument : argument.kind === "optional" ? argument.value : undefined;
    const scalar = value === undefined ? undefined : sourceTypeDescriptorStructure(value);
    assert.equal(scalar?.kind === "primitive" && scalar.primitive === (nullable ?? expected).name &&
      (argument.kind === "optional") === (nullable !== undefined), true,
    `the real Source default publishes exact width and absence: expected=${(nullable ?? expected).name}, kind=${scalar?.kind}, primitive=${scalar?.primitive}, optional=${argument.kind === "optional"}`);
    const selected = selectCsharpProviderCall(fixture.host, fixture.call, fixture.sourceFile);
    assert.equal(selected.kind, "resolved", selected.kind === "resolved" ? "resolved" : selected.reason);
    assert.deepEqual(selected.call.targetMethodTypeArguments[0].targetType, expected);
    assert.deepEqual(selected.call.targetMember.returnType, expected);
  }
});

test("inferred provider method bounds cannot widen invariant native carriers", () => {
  const parameterType = { kind: "type-parameter", identity: "T", name: "T" };
  const invariant = type => csharpTargetNamedType("Fixture.Invariant", [type], undefined, { allowsRefLikeTypeArguments: [false],});
  const method = providerMethod({
    parameters: [targetParameter("first", invariant(parameterType)), targetParameter("second", invariant(parameterType))],
    returnType: parameterType,
    typeParameters: [{ identity: "T", name: "T" }],
  });
  const float64 = csharpSourcePrimitiveTargetType("float64");
  const fixture = createCallFixture({
    member: method,
    targetParameters: method.parameters,
    sourceArgumentTargets: [invariant(csharpSourcePrimitiveTargetType("int32")), invariant(float64)],
    nativeTypeArguments: [{ selectedTarget: float64 }],
  });
  const selected = selectCsharpProviderCall(fixture.host, fixture.call, fixture.sourceFile);
  assert.equal(selected.kind, "missing");
  assert.match(selected.reason, /cannot satisfy exact target parameter/u);
});

test("generic method closure fails when selected type-argument evidence is absent", () => {
  const method = providerMethod({
    id: "Fixture.Target.Identity``1(T)",
    parameters: [
      targetParameter("value", { kind: "type-parameter", identity: "T", name: "T" }),
    ],
    returnType: { kind: "type-parameter", identity: "T", name: "T" },
    typeParameters: [{ identity: "T", name: "T" }],
  });
  const fixture = createCallFixture({
    member: method,
    targetParameters: method.parameters,
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("int32")],
    nativeTypeArguments: [{ selectedTarget: csharpSourcePrimitiveTargetType("int32") }],
  });
  assert.equal(fixture.source.sourceSelectedMethodTypeArguments.length, 1,
    "the real checked declaration retains its selected generic argument before corruption");
  const invalid = { ...fixture.source, sourceSelectedMethodTypeArguments: [] };
  const selected = instantiateCsharpProviderCall(fixture.host, fixture.relation, invalid, fixture.sourceFile);
  assert.equal(selected.kind, "rejected");
  assert.match(selected.reason, /method type-argument evidence/u);
});

test("receiver evidence closes generic provider bindings before member substitution", () => {
  const stringType = csharpStringTargetType();
  const binding = providerBinding({
    id: "Fixture.Box`1",
    typeParameters: [{ identity: "T", name: "T" }],
  });
  const method = providerMethod({
    id: "Fixture.Box`1.Get()",
    declaringType: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", identity: "T", name: "T" }],
    },
    returnType: { kind: "type-parameter", identity: "T", name: "T" },
  });
  const fixture = createCallFixture({
    binding,
    member: method,
    targetParameters: [],
    receiverTarget: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
      id: binding.id,
      typeArguments: [stringType],
    },
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.targetMember.returnType, stringType);
});

test("target-parameter receiver relations do not consume the first explicit argument", () => {
  const receiverType = {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
    id: "Fixture.Box`1",
    typeArguments: [csharpStringTargetType()],
  };
  const method = providerMethod({
    id: "Fixture.Extensions.Use``1(Box<T>,System.Int32)",
    static: true,
    receiverPassing: "target-parameter",
    parameters: [
      targetParameter("receiver", receiverType),
      targetParameter("count", csharpSourcePrimitiveTargetType("int32")),
    ],
  });
  const fixture = createCallFixture({
    binding: providerBinding({ id: "Fixture.Extensions" }),
    member: method,
    targetParameters: method.parameters,
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("int32")],
    receiverTarget: receiverType,
    receiver: { kind: "target-parameter", targetParameterIndex: 0 },
    sourceParametersRelations: [
      parameterRelation({
        sourceParameterIndex: 0,
        targetParameterIndex: 1,
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.receiver.kind, "target-parameter");
  assert.equal(selected.call.arguments[0].targetParameterIndex, 1);
});

test("constructor selection retains the exact provider signature", () => {
  const constructor = providerConstructor({
    id: "Fixture.Target..ctor(System.String)",
    parameters: [targetParameter("value", csharpStringTargetType())],
  });
  const fixture = createCallFixture({
    member: constructor,
    receiver: false,
    targetParameters: constructor.parameters,
    sourceArgumentTargets: [csharpStringTargetType()],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.targetMember.kind, "constructor");
  assert.equal(selected.call.targetMember.id, constructor.id);
});

for (const [obsolete, reason] of [
  [undefined, "The selected native constructor has no exact obsolescence evidence."],
  [true, "The selected native constructor is obsolete and cannot be called from source."],
]) {
  test(`native constructor admission refuses ${obsolete === undefined ? "missing" : "positive"} obsolescence evidence`, () => {
    const constructor = { ...providerConstructor(), csharpConstructorObsolete: obsolete };
    const fixture = createCallFixture({ member: constructor, receiver: false, targetParameters: [] });
    const selected = selectCsharpProviderCall(fixture.host, fixture.call, fixture.sourceFile);
    assert.equal(selected.kind, "missing", "only exact nonobsolete constructor evidence is admitted");
    assert.equal(selected.reason, reason, "native admission preserves the precise refusal");
  });
}

test("generic constructor families close from selected operation type arguments", () => {
  const stringType = csharpStringTargetType();
  const binding = providerBinding({
    id: "Fixture.Box`1",
    typeParameters: [{ identity: "T", name: "T" }],
  });
  const constructor = providerConstructor({
    id: "Fixture.Box`1..ctor()",
    declaringType: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", identity: "T", name: "T" }],
    },
  });
  const fixture = createCallFixture({
    binding,
    member: constructor,
    receiver: false,
    targetParameters: [],
    nativeTypeArguments: [{ selectedTarget: stringType, explicitTarget: stringType }],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.targetMember.declaringType, {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
    id: binding.id,
    typeArguments: [stringType],
  });
  assert.deepEqual(selected.call.targetMethodTypeArguments, []);
});

function createCallFixture(options = {}) {
  const declaration = options.declaration ?? providerDeclaration();
  const binding = options.binding ?? providerBinding();
  const member = options.member ?? providerMethod({
    parameters: options.targetParameters ?? [],
    declaringTypeId: binding.id,
    static: options.static ?? false,
  });
  const source = callEvidence(providerCallSource(options, binding, member));
  const relation = signatureRelation({
    declaration,
    binding,
    member,
    ...(options.receiver === undefined || options.receiver === false
      ? {}
      : { receiver: options.receiver }),
    ...(options.sourceParametersRelations === undefined
      ? {}
      : { sourceParameters: options.sourceParametersRelations }),
    ...(options.bindingTypeArgumentSource === undefined
      ? {}
      : { bindingTypeArgumentSource: options.bindingTypeArgumentSource }),
    ...(options.bindingTypeParameters === undefined
      ? {}
      : { bindingTypeParameters: options.bindingTypeParameters }),
    ...(options.methodTypeParameters === undefined
      ? {}
      : { methodTypeParameters: options.methodTypeParameters }),
  });
  const relations = options.relations ?? [relation];
  const native = providerCallNativeEvidence(source, options, binding, member);
  const facts = [
    ...(options.includeProviderFact === false ? [] : [providerFact(source.signatureDeclaration, declaration)]),
    ...native.facts,
  ];
  const direct = directProviderHost({
    sourceProgram: source.program,
    relations,
    facts,
    calls: [[source.call, source.evidence]],
    signatureDeclarations: [[
      source.evidence.selectedSignature,
      source.signatureDeclaration,
    ]],
    nodeTypes: native.nodeTypes,
    semanticTypes: native.semanticTypes,
    ...(options.objectShapes === undefined
      ? {}
      : { objectShapes: options.objectShapes }),
    ...(options.projectDeclarations === undefined
      ? {}
      : { projectDeclarations: options.projectDeclarations }),
    ...(options.projectConstructors === undefined
      ? {}
      : { projectConstructors: options.projectConstructors(source) }),
  });
  return {
    ...direct,
    call: source.call,
    source: source.evidence,
    declaration,
    binding,
    member,
    relation,
  };
}

function parameterRelation(options = {}) {
  return {
    sourceParameterIndex: options.sourceParameterIndex ?? 0,
    targetParameterIndex: options.targetParameterIndex ?? 0,
    sourcePassingMode: options.sourcePassingMode ?? "by-value",
    targetPassingMode: options.targetPassingMode ?? "by-value",
    sourceAcceptsOmission:
      options.sourceAcceptsOmission ?? options.sourceRest ?? false,
    targetAcceptsOmission:
      options.targetAcceptsOmission ?? options.targetParamsArray ?? false,
    sourceRest: options.sourceRest ?? false,
    targetParamsArray: options.targetParamsArray ?? false,
    ...(options.argumentAdapter === undefined
      ? {}
      : { argumentAdapter: options.argumentAdapter }),
  };
}

function int32ProviderAdapter() {
  return {
    kind: "static-method",
    id: "System.Convert.ToInt32(System.Double)",
    declaringType: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
      id: "System.Convert",
      csharpRender: {
        kind: "named",
        namespace: ["System"],
        name: "Convert",
      },
    },
    targetName: "ToInt32",
    inputType: csharpSourcePrimitiveTargetType("float64"),
    resultType: csharpSourcePrimitiveTargetType("int32"),
  };
}

function byrefNativeEvidence(source, mode, target, includeArgument = true) {
  const parameter = source.evidence.sourceSelectedSignatureParameters[0].parameterDeclaration;
  const facts = [passingFact(parameter, mode)];
  if (!includeArgument) return { facts };
  const argument = source.evidence.sourceArguments[0].expression;
  const declaration = source.program.navigation.referenceFor(argument)?.declaration;
  const storage = declaration === undefined ? undefined : source.program.ast.name(declaration);
  assert.equal(storage !== undefined && storage !== argument, true,
    "the same checked input's storage declaration and call read retain distinct original occurrences");
  facts.push(passingFact(argument, mode, storage));
  return { facts, nodeTypes: [[storage, target]] };
}
