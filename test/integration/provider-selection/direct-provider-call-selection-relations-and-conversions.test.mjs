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
} from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import {
  instantiateCsharpProviderCall,
} from "../../../dist/policy/members/index.js";
import {
  csharpNullableReferenceTargetType,
  csharpNullableValueTargetType,
  csharpTargetNamedType,
} from "../../../dist/policy/types/index.js";

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

test("project-owned implicit constructors adapt an exact inherited provider signature", () => {
  const selectedCalleeDeclaration = {};
  const selectedSignature = {};
  const baseMember = providerConstructor();
  const projectMember = {
    ...baseMember,
    id: "tsonic.source:project::forward-constructor",
    declaringType: {
      kind: "target-named",
      id: "tsonic.source:project",
    },
  };
  const projectConstructors = new Map([[selectedCalleeDeclaration, new Map([[
    selectedSignature,
    {
      targetMember: projectMember,
      providerBaseMemberId: baseMember.id,
    },
  ]])]]);
  const fixture = createCallFixture({
    selectedCalleeDeclaration,
    projectDeclarations: [selectedCalleeDeclaration],
    selectedSignature,
    member: baseMember,
    projectConstructors,
  });
  const selected = selectCsharpTargetCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.targetMember.id, projectMember.id);
  assert.equal(selected.call.targetMember.declaringType.id, "tsonic.source:project");
});

test("project-owned inherited provider signatures fail closed without an exact forwarding constructor", () => {
  const selectedCalleeDeclaration = {};
  const fixture = createCallFixture({
    selectedCalleeDeclaration,
    projectDeclarations: [selectedCalleeDeclaration],
  });
  const selected = selectCsharpTargetCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.match(selected.reason, /no exact implicit constructor relation/u);
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

test("exact provider argument adapters close otherwise invalid target conversions", () => {
  const adapter = int32ProviderAdapter();
  const withoutAdapter = createCallFixture({
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("float64")],
    targetParameters: [
      targetParameter("value", csharpSourcePrimitiveTargetType("int32")),
    ],
  });
  const withAdapter = createCallFixture({
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("float64")],
    targetParameters: [
      targetParameter("value", csharpSourcePrimitiveTargetType("int32")),
    ],
    sourceParametersRelations: [parameterRelation({ argumentAdapter: adapter })],
  });

  const rejected = selectCsharpProviderCall(
    withoutAdapter.host,
    withoutAdapter.call,
    withoutAdapter.sourceFile,
  );
  const selected = selectCsharpProviderCall(
    withAdapter.host,
    withAdapter.call,
    withAdapter.sourceFile,
  );

  assert.equal(rejected.kind, "missing");
  assert.equal(selected.kind, "resolved");
  assert.equal(
    selected.call.argumentMappings[0]?.conversion.kind,
    "provider-argument-adapter",
  );
  assert.deepEqual(
    selected.call.argumentMappings[0]?.conversion.adapter,
    adapter,
  );
});

test("provider calls accept exact lifted implicit conversions between nullable value carriers", () => {
  const fixture = createCallFixture({
    sourceArgumentTargets: [
      csharpNullableValueTargetType(
        csharpSourcePrimitiveTargetType("int32"),
      ),
    ],
    targetParameters: [
      targetParameter(
        "value",
        csharpNullableValueTargetType(
          csharpSourcePrimitiveTargetType("float64"),
        ),
      ),
    ],
  });

  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );

  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.argumentMappings[0]?.conversion, {
    kind: "implicit",
    proof: "nullable",
  });
});

test("provider calls lift exact static argument adapters over nullable value carriers", () => {
  const sourceType = csharpNullableValueTargetType(
    csharpSourcePrimitiveTargetType("float64"),
  );
  const targetType = csharpNullableValueTargetType(
    csharpSourcePrimitiveTargetType("int32"),
  );
  const adapter = int32ProviderAdapter();
  const fixture = createCallFixture({
    sourceArgumentTargets: [sourceType],
    targetParameters: [targetParameter("value", targetType)],
    sourceParametersRelations: [parameterRelation({ argumentAdapter: adapter })],
  });

  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );

  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.argumentMappings[0]?.conversion, {
    kind: "lifted-provider-argument-adapter",
    adapter,
    sourceElementType: csharpSourcePrimitiveTargetType("float64"),
    targetElementType: csharpSourcePrimitiveTargetType("int32"),
  });
});

test("provider calls reject nullable adapter lifting when element identities differ", () => {
  const fixture = createCallFixture({
    sourceArgumentTargets: [
      csharpNullableValueTargetType(
        csharpSourcePrimitiveTargetType("float64"),
      ),
    ],
    targetParameters: [
      targetParameter(
        "value",
        csharpNullableValueTargetType(
          csharpSourcePrimitiveTargetType("uint32"),
        ),
      ),
    ],
    sourceParametersRelations: [
      parameterRelation({ argumentAdapter: int32ProviderAdapter() }),
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
    /cannot relate 'target:System.Nullable`1<source:float64>' through 'source:float64' and 'source:int32' to 'target:System.Nullable`1<source:uint32>'/u,
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

test("provider generic constraints accept only exactly proven target categories", () => {
  const cases = [
    {
      name: "value type",
      constraint: { kind: "value-type" },
      accepted: csharpSourcePrimitiveTargetType("int32"),
      rejected: csharpStringTargetType(),
      diagnostic: /not a proven non-nullable C# value type/u,
    },
    {
      name: "reference type",
      constraint: { kind: "reference-type" },
      accepted: csharpStringTargetType(),
      rejected: csharpSourcePrimitiveTargetType("int32"),
      diagnostic: /not a proven C# reference type/u,
    },
    {
      name: "unmanaged",
      constraint: { kind: "unmanaged" },
      accepted: csharpSourcePrimitiveTargetType("int32"),
      rejected: {
        kind: "array",
        element: csharpSourcePrimitiveTargetType("int32"),
      },
      diagnostic: /not a proven non-nullable unmanaged C# type/u,
    },
    {
      name: "notnull",
      constraint: {
        kind: "target-specific",
        target: "csharp",
        name: "notnull",
      },
      accepted: csharpStringTargetType(),
      rejected: csharpNullableReferenceTargetType(
        csharpStringTargetType(),
      ),
      diagnostic: /nullable or has no exact C# nullability category/u,
    },
  ];

  for (const row of cases) {
    const accepted = createConstrainedMethodFixture(
      row.constraint,
      row.accepted,
    );
    assert.equal(
      selectCsharpProviderCall(
        accepted.host,
        accepted.call,
        accepted.sourceFile,
      ).kind,
      "resolved",
      row.name,
    );

    const rejected = createConstrainedMethodFixture(
      row.constraint,
      row.rejected,
    );
    const selection = selectCsharpProviderCall(
      rejected.host,
      rejected.call,
      rejected.sourceFile,
    );
    assert.equal(selection.kind, "missing", row.name);
    assert.match(selection.reason, row.diagnostic, row.name);
  }
});

test("provider constructor and interface constraints use exact project type facts", () => {
  const concreteType = csharpTargetNamedType("Fixture.Concrete");
  const abstractType = csharpTargetNamedType("Fixture.Abstract");
  const contractType = csharpTargetNamedType("Fixture.IContract");
  const implementingType = csharpTargetNamedType("Fixture.Implementation");
  const definitions = new Map([
    [
      concreteType.id,
      {
        kind: "class",
        abstract: false,
        publicParameterlessConstructor: true,
      },
    ],
    [
      abstractType.id,
      {
        kind: "class",
        abstract: true,
        publicParameterlessConstructor: true,
      },
    ],
    [
      implementingType.id,
      {
        kind: "class",
        abstract: false,
        publicParameterlessConstructor: true,
      },
    ],
  ]);
  const directSupertypes = new Map([
    [implementingType.id, [contractType]],
  ]);

  const constructible = createConstrainedMethodFixture(
    { kind: "constructible" },
    concreteType,
    { projectTypeDefinitions: definitions },
  );
  assert.equal(
    selectCsharpProviderCall(
      constructible.host,
      constructible.call,
      constructible.sourceFile,
    ).kind,
    "resolved",
  );
  const abstract = createConstrainedMethodFixture(
    { kind: "constructible" },
    abstractType,
    { projectTypeDefinitions: definitions },
  );
  const abstractSelection = selectCsharpProviderCall(
    abstract.host,
    abstract.call,
    abstract.sourceFile,
  );
  assert.equal(abstractSelection.kind, "missing");
  assert.match(
    abstractSelection.reason,
    /not a proven non-abstract type with a public parameterless constructor/u,
  );

  const implementing = createConstrainedMethodFixture(
    {
      kind: "implements",
      contract: contractType.id,
    },
    implementingType,
    {
      projectTypeDefinitions: definitions,
      projectDirectSupertypes: directSupertypes,
    },
  );
  assert.equal(
    selectCsharpProviderCall(
      implementing.host,
      implementing.call,
      implementing.sourceFile,
    ).kind,
    "resolved",
  );
  const unrelated = createConstrainedMethodFixture(
    {
      kind: "implements",
      contract: contractType.id,
    },
    concreteType,
    {
      projectTypeDefinitions: definitions,
      projectDirectSupertypes: directSupertypes,
    },
  );
  const unrelatedSelection = selectCsharpProviderCall(
    unrelated.host,
    unrelated.call,
    unrelated.sourceFile,
  );
  assert.equal(unrelatedSelection.kind, "missing");
  assert.match(
    unrelatedSelection.reason,
    /heritage graph does not contain the required contract/u,
  );
});

test("static-interface dispatch validates the exact selected invocation type", () => {
  const selectedType = {};
  const contract = csharpTargetNamedType("Fixture.IStaticContract");
  const implementation = csharpTargetNamedType("Fixture.StaticImplementation");
  const member = providerMethod({
    id: "Fixture.IStaticContract.Create()",
    static: true,
    declaringType: contract,
    csharpInvocation: {
      kind: "static-member",
      operation: "call",
      receiver: {
        kind: "invocation-type-argument",
        index: 0,
      },
    },
  });
  const fixture = createCallFixture({
    member,
    receiver: false,
    methodTypeArguments: [{ selectedType }],
    invocationTypeParameters: [{
      sourceTypeParameterIndex: 0,
      targetTypeParameterIndex: 0,
    }],
    selectedTypeParameterCount: 1,
    additionalSemanticTypes: [[selectedType, implementation]],
    projectTypeDefinitions: new Map([[
      implementation.id,
      {
        kind: "class",
        abstract: false,
        publicParameterlessConstructor: true,
      },
    ]]),
    projectDirectSupertypes: new Map([[
      implementation.id,
      [contract],
    ]]),
  });
  const selection = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selection.kind, "resolved");
  assert.deepEqual(
    selection.call.targetInvocationTypeArguments.map((argument) =>
      argument.targetType),
    [implementation],
  );
});

function createConstrainedMethodFixture(
  constraint,
  targetType,
  options = {},
) {
  const selectedType = {};
  const member = providerMethod({
    typeParameters: [{ name: "T", constraints: [constraint] }],
  });
  return createCallFixture({
    member,
    methodTypeArguments: [{ selectedType }],
    additionalSemanticTypes: [[selectedType, targetType]],
    ...options,
  });
}

function createCallFixture(options = {}) {
  const declaration = options.declaration ?? providerDeclaration();
  const binding = options.binding ?? providerBinding();
  const member = options.member ?? providerMethod({
    parameters: options.targetParameters ?? [],
    declaringTypeId: binding.id,
    static: options.static ?? false,
  });
  const source = callEvidence({
    ...(options.selectedSignature === undefined
      ? {}
      : { selectedSignature: options.selectedSignature }),
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
    ...(options.selectedCalleeDeclaration === undefined
      ? {}
      : {
          selectedCalleeDeclaration: options.selectedCalleeDeclaration,
        }),
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
    ...(options.bindingTypeParameters === undefined
      ? {}
      : { bindingTypeParameters: options.bindingTypeParameters }),
    ...(options.methodTypeParameters === undefined
      ? {}
      : { methodTypeParameters: options.methodTypeParameters }),
    ...(options.invocationTypeParameters === undefined
      ? {}
      : { invocationTypeParameters: options.invocationTypeParameters }),
    ...(options.selectedTypeParameterCount === undefined
      ? {}
      : {
          selectedTypeParameterCount:
            options.selectedTypeParameterCount,
        }),
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
    ...(options.objectShapes === undefined
      ? {}
      : { objectShapes: options.objectShapes }),
    ...(options.projectDeclarations === undefined
      ? {}
      : { projectDeclarations: options.projectDeclarations }),
    ...(options.projectConstructors === undefined
      ? {}
      : { projectConstructors: options.projectConstructors }),
    ...(options.projectTypeDefinitions === undefined
      ? {}
      : { projectTypeDefinitions: options.projectTypeDefinitions }),
    ...(options.projectDirectSupertypes === undefined
      ? {}
      : { projectDirectSupertypes: options.projectDirectSupertypes }),
    ...(options.effectiveTypeArguments === undefined
      ? {}
      : { effectiveTypeArguments: options.effectiveTypeArguments }),
    ...(options.typeSymbols === undefined
      ? {}
      : { typeSymbols: options.typeSymbols }),
    ...(options.symbolDeclarations === undefined
      ? {}
      : { symbolDeclarations: options.symbolDeclarations }),
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
      kind: "target-named",
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
