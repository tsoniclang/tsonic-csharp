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
import {
  csharpNullableReferenceTargetType,
  csharpNullableValueTargetType,
  csharpTargetNamedType,
} from "../../../dist/policy/types/index.js";

test("target operations can consume selected method type arguments as structural binding arguments", () => {
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const typeParameter = { kind: "type-parameter", identity: "T", name: "T" };
  const binding = providerBinding({
    id: "Fixture.Array`1",
    typeParameters: [{ identity: "T", name: "T" }],
    csharpType: { kind: "array", element: typeParameter },
  });
  const method = Object.freeze({
    ...providerMethod({
      id: "Fixture.Array`1.Create(System.Int32)",
      declaringType: { kind: "array", element: typeParameter },
      static: true,
      parameters: [targetParameter("length", int32)],
      returnType: { kind: "array", element: typeParameter },
    }),
    csharpInvocation: {
      kind: "array-creation",
      lengthParameterIndex: 0,
    },
  });
  const fixture = createCallFixture({
    declaration: providerDeclaration({ memberStatic: true }),
    binding,
    member: method,
    receiver: false,
    targetParameters: method.parameters,
    sourceArgumentTargets: [int32],
    nativeTypeArguments: [{ selectedTarget: int32, explicitTarget: int32 }],
    bindingTypeArgumentSource: "selected-operation-type-arguments",
    bindingTypeParameters: [{
      sourceTypeParameterIndex: 0,
      targetTypeParameterIndex: 0,
    }],
    methodTypeParameters: [],
  });
  const selected = selectCsharpProviderCall(
    fixture.host,
    fixture.call,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.call.targetMember.declaringType, {
    kind: "array",
    element: int32,
  });
  assert.deepEqual(selected.call.targetMember.returnType, {
    kind: "array",
    element: int32,
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
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
    id: "tsonic.source:Input",
    csharpSourceDeclarationKind: "interface",
  };
  const generatedShape = {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
    id: "tsonic.shape:Input",
  };
  const shape = Object.freeze({
    targetType: generatedShape,
    members: [],
    implements: [sourceInterface],
  });
  const fixture = createCallFixture({
    sourceArgumentTargets: [generatedShape],
    targetParameters: [targetParameter("value", sourceInterface)],
    objectShapes: Object.freeze({
      resolveNode() {
        return shape;
      },
      resolveTarget(type) {
        return type === generatedShape ? shape : undefined;
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
