import {
  assert,
  callEvidence,
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
  sourceArgumentBinding,
  sourceParameter,
  targetParameter,
  test,
} from "./direct-provider-selection.helpers.mjs";

test("an exact selected provider signature closes one target call", () => {
  const fixture = createCallFixture({
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: [
      targetParameter("value", csharpStringTargetType()),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.targetMember.id, fixture.member.id);
  assert.equal(selected.call.arguments[0].targetParameterIndex, 0);
  assert.equal(selected.call.origin, "provider");
});

test("same-spelling source calls without provider evidence remain source-owned", () => {
  const fixture = createCallFixture({
    includeProviderFact: false,
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: [
      targetParameter("value", csharpStringTargetType(), {
        csharpAcceptsCheckedSourceArgument: true,
      }),
    ],
  });
  const selected = selectCsharpTargetCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "source-owned");
  assert.match(selected.reason, /no provider declaration evidence/u);
});

test("selected provider signatures do not search sibling overload identities", () => {
  const selectedDeclaration = providerDeclaration({
    signatureId: "provider.signature.string",
  });
  const siblingDeclaration = providerDeclaration({
    signatureId: "provider.signature.object",
  });
  const fixture = createCallFixture({
    declaration: selectedDeclaration,
    relations: [
      signatureRelation({
        declaration: siblingDeclaration,
        member: providerMethod({
          id: "Fixture.Target.Member(System.Object)",
          parameters: [targetParameter("value", csharpObjectTargetType())],
        }),
        sourceParameters: [parameterRelation()],
      }),
    ],
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: [
      targetParameter("value", csharpStringTargetType()),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "not-provider");
  assert.match(selected.reason, /no C# target relation/u);
});

test("multiple exact target relations remain ambiguous instead of being ranked", () => {
  const declaration = providerDeclaration();
  const firstMember = providerMethod({
    id: "Fixture.First.Member(System.String)",
    declaringTypeId: "Fixture.First",
    parameters: [targetParameter("value", csharpStringTargetType())],
  });
  const secondMember = providerMethod({
    id: "Fixture.Second.Member(System.String)",
    declaringTypeId: "Fixture.Second",
    parameters: [targetParameter("value", csharpStringTargetType())],
  });
  const fixture = createCallFixture({
    declaration,
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: firstMember.parameters,
    relations: [
      signatureRelation({
        declaration,
        binding: providerBinding({ id: "Fixture.First" }),
        member: firstMember,
      }),
      signatureRelation({
        declaration,
        binding: providerBinding({ id: "Fixture.Second" }),
        member: secondMember,
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "ambiguous");
  assert.deepEqual(selected.candidates, [
    "Fixture.First::Fixture.First.Member(System.String)",
    "Fixture.Second::Fixture.Second.Member(System.String)",
  ]);
});

test("collapsed source overloads select the uniquely best implicit C# target conversion", () => {
  const declaration = providerDeclaration();
  const exactMember = providerMethod({
    id: "Fixture.Target.Member(System.Int32)",
    parameters: [
      targetParameter("value", csharpSourcePrimitiveTargetType("int32")),
    ],
  });
  const widenedMember = providerMethod({
    id: "Fixture.Target.Member(System.Double)",
    parameters: [
      targetParameter("value", csharpSourcePrimitiveTargetType("float64")),
    ],
  });
  const fixture = createCallFixture({
    declaration,
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("int32")],
    targetParameters: exactMember.parameters,
    relations: [
      signatureRelation({
        declaration,
        member: exactMember,
      }),
      signatureRelation({
        declaration,
        member: widenedMember,
      }),
    ],
  });

  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );

  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.targetMember.id, exactMember.id);
});

test("exact selected signatures reject incompatible target argument representations", () => {
  const fixture = createCallFixture({
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("int32")],
    targetParameters: [
      targetParameter("value", csharpStringTargetType()),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.match(
    selected.reason,
    /cannot satisfy exact target parameter 'value'/u,
  );
});

test("checked-source parameter acceptance is scoped to the exact provider relation", () => {
  const fixture = createCallFixture({
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("int32")],
    targetParameters: [
      targetParameter("callback", csharpObjectTargetType(), {
        csharpAcceptsCheckedSourceArgument: true,
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(
    selected.call.targetMember.parameters[0].csharpAcceptsCheckedSourceArgument,
    true,
  );
});

test("optional source and target parameters may be omitted only when both contracts agree", () => {
  const parameterType = csharpStringTargetType();
  const parameterDeclaration = {};
  const fixture = createCallFixture({
    sourceParameters: [
      sourceParameter({
        parameterDeclaration,
        selectedType: {},
        acceptsOmission: true,
      }),
    ],
    argumentExpressions: [],
    argumentTypes: [],
    bindings: [],
    targetParameters: [
      targetParameter("value", parameterType, { optional: true }),
    ],
    sourceParametersRelations: [
      parameterRelation({
        sourceAcceptsOmission: true,
        targetAcceptsOmission: true,
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.arguments, []);
});

test("optional omission fails closed when the target parameter remains required", () => {
  const fixture = createCallFixture({
    sourceParameters: [
      sourceParameter({
        selectedType: {},
        acceptsOmission: true,
      }),
    ],
    argumentExpressions: [],
    argumentTypes: [],
    bindings: [],
    targetParameters: [
      targetParameter("value", csharpStringTargetType()),
    ],
    sourceParametersRelations: [
      parameterRelation({
        sourceAcceptsOmission: true,
        targetAcceptsOmission: false,
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.match(selected.reason, /does not supply every required parameter/u);
});

test("rest arguments retain one declared parameter identity and target params slot", () => {
  const firstType = {};
  const secondType = {};
  const parameterType = {};
  const parameterDeclaration = {};
  const fixture = createCallFixture({
    sourceParameters: [
      sourceParameter({
        parameterDeclaration,
        selectedType: parameterType,
        rest: true,
      }),
    ],
    argumentTypes: [firstType, secondType],
    bindings: [
      sourceArgumentBinding({
        sourceArgumentIndex: 0,
        effectiveArgumentIndex: 0,
        sourceParameterIndex: 0,
        sourceParameterForm: "rest-element",
        selectedArgumentType: firstType,
        selectedParameterType: parameterType,
      }),
      sourceArgumentBinding({
        sourceArgumentIndex: 1,
        effectiveArgumentIndex: 1,
        sourceParameterIndex: 0,
        sourceParameterForm: "rest-element",
        selectedArgumentType: secondType,
        selectedParameterType: parameterType,
      }),
    ],
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
});

test("byref parameter modes require the exact finalized source parameter fact", () => {
  const parameterDeclaration = {};
  const target = {
    ...targetParameter("value", csharpStringTargetType()),
    passingMode: "ref",
  };
  const fixture = createCallFixture({
    sourceParameters: [
      sourceParameter({
        parameterDeclaration,
        selectedType: {},
      }),
    ],
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "ref",
        targetPassingMode: "ref",
      }),
    ],
    additionalFacts: [passingFact(parameterDeclaration, "ref")],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(
    selected.call.targetMember.parameters[0].passingMode,
    "ref",
  );
});

test("missing byref source facts cannot be inferred from target parameter mode", () => {
  const target = {
    ...targetParameter("value", csharpStringTargetType()),
    passingMode: "ref",
  };
  const fixture = createCallFixture({
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "ref",
        targetPassingMode: "ref",
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.match(selected.reason, /contradicts selected source or target parameter semantics/u);
});

test("selected method type arguments close generic target methods directly", () => {
  const selectedType = {};
  const explicitTypeNode = {};
  const typeParameter = { name: "T" };
  const method = providerMethod({
    id: "Fixture.Target.Identity``1(T)",
    parameters: [
      targetParameter("value", { kind: "type-parameter", name: "T" }),
    ],
    returnType: { kind: "type-parameter", name: "T" },
    typeParameters: [typeParameter],
  });
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const fixture = createCallFixture({
    member: method,
    targetParameters: method.parameters,
    sourceArgumentTargets: [int32],
    methodTypeArguments: [{
      typeParameterName: "T",
      typeParameter: {},
      selectedType,
      explicitTypeNode,
    }],
    additionalNodeTypes: [[explicitTypeNode, int32]],
    additionalSemanticTypes: [[selectedType, csharpStringTargetType()]],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.targetMethodTypeArguments, [int32]);
  assert.deepEqual(selected.call.targetMember.parameters[0].type, int32);
  assert.deepEqual(selected.call.targetMember.returnType, int32);
});

test("generic method closure fails when selected type-argument evidence is absent", () => {
  const method = providerMethod({
    id: "Fixture.Target.Identity``1(T)",
    parameters: [
      targetParameter("value", { kind: "type-parameter", name: "T" }),
    ],
    returnType: { kind: "type-parameter", name: "T" },
    typeParameters: [{ name: "T" }],
  });
  const fixture = createCallFixture({
    member: method,
    targetParameters: method.parameters,
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("int32")],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.match(selected.reason, /method type-argument evidence/u);
});

test("receiver evidence closes generic provider bindings before member substitution", () => {
  const stringType = csharpStringTargetType();
  const binding = providerBinding({
    id: "Fixture.Box`1",
    typeParameters: [{ name: "T" }],
  });
  const method = providerMethod({
    id: "Fixture.Box`1.Get()",
    declaringType: {
      kind: "target-named",
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", name: "T" }],
    },
    returnType: { kind: "type-parameter", name: "T" },
  });
  const fixture = createCallFixture({
    binding,
    member: method,
    targetParameters: [],
    argumentExpressions: [],
    argumentTypes: [],
    bindings: [],
    receiverTarget: {
      kind: "target-named",
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

test("first-argument receiver relations do not consume the first explicit argument", () => {
  const receiverType = {
    kind: "target-named",
    id: "Fixture.Box`1",
    typeArguments: [csharpStringTargetType()],
  };
  const method = providerMethod({
    id: "Fixture.Extensions.Use``1(Box<T>,System.Int32)",
    static: true,
    receiverPassing: "first-argument",
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

test("generic constructor families close from selected operation type arguments", () => {
  const stringType = csharpStringTargetType();
  const explicitTypeNode = {};
  const selectedType = {};
  const binding = providerBinding({
    id: "Fixture.Box`1",
    typeParameters: [{ name: "T" }],
  });
  const constructor = providerConstructor({
    id: "Fixture.Box`1..ctor()",
    declaringType: {
      kind: "target-named",
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", name: "T" }],
    },
  });
  const fixture = createCallFixture({
    binding,
    member: constructor,
    receiver: false,
    targetParameters: [],
    argumentExpressions: [],
    argumentTypes: [],
    bindings: [],
    methodTypeArguments: [{
      typeParameterName: "T",
      typeParameter: {},
      selectedType,
      explicitTypeNode,
    }],
    additionalNodeTypes: [[explicitTypeNode, stringType]],
    additionalSemanticTypes: [[selectedType, stringType]],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.targetMember.declaringType, {
    kind: "target-named",
    id: binding.id,
    typeArguments: [stringType],
  });
  assert.deepEqual(selected.call.targetMethodTypeArguments, []);
});

test("constructor selection does not fall through to a same-shaped sibling signature", () => {
  const selectedDeclaration = providerDeclaration({
    signatureId: "provider.constructor.string",
  });
  const siblingDeclaration = providerDeclaration({
    signatureId: "provider.constructor.object",
  });
  const sibling = providerConstructor({
    id: "Fixture.Target..ctor(System.Object)",
    parameters: [targetParameter("value", csharpObjectTargetType())],
  });
  const fixture = createCallFixture({
    declaration: selectedDeclaration,
    member: sibling,
    receiver: false,
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: sibling.parameters,
    relations: [
      signatureRelation({
        declaration: siblingDeclaration,
        member: sibling,
        receiver: { kind: "none" },
      }),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "not-provider");
});

test("representable numeric literals satisfy exact integral target parameters", () => {
  const literal = { syntaxKind: "IsNumericLiteral", text: "7" };
  const fixture = createCallFixture({
    argumentExpressions: [literal],
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("float64")],
    targetParameters: [
      targetParameter("value", csharpSourcePrimitiveTargetType("int32")),
    ],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
});

function createCallFixture(options = {}) {
  const declaration = options.declaration ?? providerDeclaration();
  const binding = options.binding ?? providerBinding();
  const member = options.member ?? providerMethod({
    parameters: options.targetParameters ?? [],
    declaringTypeId: binding.id,
    static: options.static ?? false,
  });
  const source = callEvidence({
    ...(options.sourceParameters === undefined
      ? {}
      : { parameters: options.sourceParameters }),
    ...(options.argumentExpressions === undefined
      ? {}
      : { argumentExpressions: options.argumentExpressions }),
    argumentTypes: options.argumentTypes ??
      (options.sourceArgumentTargets ?? []).map(() => ({})),
    ...(options.bindings === undefined ? {} : { bindings: options.bindings }),
    ...(options.methodTypeArguments === undefined
      ? {}
      : { methodTypeArguments: options.methodTypeArguments }),
    ...(options.receiver === false ? { receiver: false } : {}),
  });
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
  });
  const relations = options.relations ?? [relation];
  const sourceArgumentTargets = options.sourceArgumentTargets ?? [];
  const receiverTarget = options.receiverTarget ?? {
    kind: "target-named",
    id: binding.id,
    ...(binding.typeParameters === undefined
      ? {}
      : {
          typeArguments: binding.typeParameters.map(() =>
            csharpStringTargetType()),
        }),
  };
  const nodeTypes = [
    ...source.evidence.sourceArguments.map((argument, index) => [
      argument.expression,
      sourceArgumentTargets[index],
    ]),
    ...(source.evidence.sourceReceiver === undefined
      ? []
      : [[source.evidence.sourceReceiver.expression, receiverTarget]]),
    ...(options.additionalNodeTypes ?? []),
  ].filter((entry) => entry[1] !== undefined);
  const semanticTypes = [
    ...source.evidence.sourceArguments.map((argument, index) => [
      argument.type,
      sourceArgumentTargets[index],
    ]),
    ...(source.evidence.sourceReceiver === undefined
      ? []
      : [[source.evidence.sourceReceiver.type, receiverTarget]]),
    [source.evidence.sourceResultType, member.returnType],
    ...(options.additionalSemanticTypes ?? []),
  ].filter((entry) => entry[1] !== undefined);
  const facts = [
    ...(options.includeProviderFact === false
      ? []
      : [providerFact(source.signatureDeclaration, declaration)]),
    ...(options.additionalFacts ?? []),
  ];
  const direct = directProviderHost({
    relations,
    facts,
    calls: [[source.call, source.evidence]],
    signatureDeclarations: [[
      source.evidence.selectedSignature,
      source.signatureDeclaration,
    ]],
    nodeTypes,
    semanticTypes,
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
    sourceAcceptsOmission: options.sourceAcceptsOmission ?? false,
    targetAcceptsOmission: options.targetAcceptsOmission ?? false,
    sourceRest: options.sourceRest ?? false,
    targetParamsArray: options.targetParamsArray ?? false,
  };
}
