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
import {
  instantiateCsharpProviderCall,
} from "../dist/policy/members/index.js";
import {
  csharpNullableReferenceTargetType,
  csharpNullableValueTargetType,
  csharpTargetNamedType,
} from "../dist/policy/types/index.js";

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
  const sourceArgument = {};
  const storageExpression = {};
  const target = {
    ...targetParameter("value", csharpStringTargetType()),
    passingMode: "byref-readwrite",
  };
  const fixture = createCallFixture({
    sourceParameters: [
      sourceParameter({
        parameterDeclaration,
        selectedType: {},
      }),
    ],
    argumentExpressions: [sourceArgument],
    sourceArgumentTargets: [csharpObjectTargetType()],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-readwrite",
        targetPassingMode: "byref-readwrite",
      }),
    ],
    additionalFacts: [
      passingFact(parameterDeclaration, "byref-readwrite"),
      passingFact(sourceArgument, "byref-readwrite", storageExpression),
    ],
    additionalNodeTypes: [[storageExpression, csharpStringTargetType()]],
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
  const parameterDeclaration = {};
  const fixture = createCallFixture({
    sourceParameters: [sourceParameter({ parameterDeclaration })],
    sourceArgumentTargets: [csharpStringTargetType()],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-readwrite",
        targetPassingMode: "byref-readwrite",
      }),
    ],
    additionalFacts: [
      passingFact(parameterDeclaration, "byref-readwrite"),
    ],
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
  const parameterDeclaration = {};
  const sourceArgument = {};
  const storageExpression = {};
  const target = {
    ...targetParameter(
      "value",
      csharpSourcePrimitiveTargetType("int32"),
    ),
    passingMode: "byref-writeonly-must-init",
  };
  const fixture = createCallFixture({
    sourceParameters: [sourceParameter({ parameterDeclaration })],
    argumentExpressions: [sourceArgument],
    sourceArgumentTargets: [csharpSourcePrimitiveTargetType("float64")],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-writeonly-must-init",
        targetPassingMode: "byref-writeonly-must-init",
      }),
    ],
    additionalFacts: [
      passingFact(parameterDeclaration, "byref-writeonly-must-init"),
      passingFact(
        sourceArgument,
        "byref-writeonly-must-init",
        storageExpression,
      ),
    ],
    additionalNodeTypes: [[
      storageExpression,
      csharpSourcePrimitiveTargetType("uint8"),
    ]],
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
  const parameterDeclaration = {};
  const sourceArgument = {};
  const storageExpression = {};
  const todo = csharpTargetNamedType("Example.Todo");
  const nullableTodo = csharpNullableReferenceTargetType(todo);
  const target = {
    ...targetParameter("value", todo),
    passingMode: "byref-writeonly-must-init",
    csharpOutputMayBeNull: true,
  };
  const fixture = createCallFixture({
    sourceParameters: [sourceParameter({ parameterDeclaration })],
    argumentExpressions: [sourceArgument],
    sourceArgumentTargets: [nullableTodo],
    targetParameters: [target],
    sourceParametersRelations: [
      parameterRelation({
        sourcePassingMode: "byref-writeonly-must-init",
        targetPassingMode: "byref-writeonly-must-init",
      }),
    ],
    additionalFacts: [
      passingFact(parameterDeclaration, "byref-writeonly-must-init"),
      passingFact(
        sourceArgument,
        "byref-writeonly-must-init",
        storageExpression,
      ),
    ],
    additionalNodeTypes: [[storageExpression, nullableTodo]],
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
  assert.deepEqual(selected.call.targetMethodTypeArguments, [{
    kind: "selected-source",
    targetType: int32,
    selectedType,
    explicitTypeNode,
  }]);
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

test("exact generated object-shape contracts satisfy their implemented target interface", () => {
  const sourceInterface = {
    kind: "target-named",
    id: "tsonic.source:Input",
    csharpSourceDeclarationKind: "interface",
  };
  const generatedShape = {
    kind: "target-named",
    id: "tsonic.shape:Input",
  };
  const fixture = createCallFixture({
    sourceArgumentTargets: [generatedShape],
    targetParameters: [targetParameter("value", sourceInterface)],
    objectShapes: Object.freeze({
      resolveNode() {
        return {
          targetType: generatedShape,
          members: [],
          implements: [sourceInterface],
        };
      },
      resolveTarget() {
        return undefined;
      },
    }),
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  const instantiated = instantiateCsharpProviderCall(
    fixture.host,
    fixture.relation,
    fixture.source,
    fixture.sourceFile,
  );
  assert.equal(instantiated.kind, "resolved");
  assert.equal(
    instantiated.argumentMappings[0]?.conversion.proof,
    "object-shape-interface",
  );
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
