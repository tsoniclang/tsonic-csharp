import {
  assert,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  directProviderHost,
  elementEvidence,
  memberRelation,
  propertyEvidence,
  providerBinding,
  providerDeclaration,
  providerFact,
  providerField,
  providerIndexer,
  selectCsharpProviderElement,
  selectCsharpProviderProperty,
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
  signatureRelation,
  targetParameter,
  test,
} from "./direct-provider-selection.helpers.mjs";

test("property selection uses the exact provider member identity, not its spelling", () => {
  const fixture = createPropertyFixture();
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.property.targetMember.id, fixture.member.id);
  assert.equal(selected.property.targetMember.targetName, "TargetValue");
});

test("same-spelling properties without provider evidence remain source-owned", () => {
  const fixture = createPropertyFixture({ includeProviderFact: false });
  const selected = selectCsharpTargetProperty(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "source-owned");
  assert.match(selected.reason, /no provider declaration evidence/u);
});

test("property selection accepts exact declaration evidence without a selected symbol", () => {
  const fixture = createPropertyFixture({ selectedSymbol: null });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
});

test("contradictory selected property subjects fail closed", () => {
  const selectedSymbol = {};
  const selectedDeclaration = {};
  const first = providerDeclaration({
    signatureId: null,
    memberId: "provider.first",
  });
  const second = providerDeclaration({
    signatureId: null,
    memberId: "provider.second",
  });
  const fixture = createPropertyFixture({
    declaration: first,
    selectedSymbol,
    selectedDeclaration,
    additionalFacts: [providerFact(selectedSymbol, second)],
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "conflict");
  assert.match(selected.reason, /contradictory provider identities/u);
});

test("generic property members close from exact receiver representation", () => {
  const stringType = csharpStringTargetType();
  const binding = providerBinding({
    id: "Fixture.Box`1",
    typeParameters: [{ name: "T" }],
  });
  const member = providerField({
    id: "Fixture.Box`1.Value",
    targetName: "Value",
    declaringType: {
      kind: "target-named",
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", name: "T" }],
    },
    returnType: { kind: "type-parameter", name: "T" },
  });
  const fixture = createPropertyFixture({
    binding,
    member,
    receiverTarget: {
      kind: "target-named",
      id: binding.id,
      typeArguments: [stringType],
    },
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.property.targetMember.returnType, stringType);
});

test("readonly target properties reject exact source writes", () => {
  const fixture = createPropertyFixture({
    accessMode: "write",
    member: providerField({ readonly: true }),
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.equal(
    selected.reason,
    "No related C# provider member satisfies the exact selected property access.",
  );
});

test("writable target fields accept exact source writes", () => {
  const fixture = createPropertyFixture({
    accessMode: "write",
    member: providerField({ readonly: false }),
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.property.targetMember.kind, "field");
});

test("element selection uses declaration-only index-signature evidence", () => {
  const fixture = createElementFixture({ selectedSymbol: null });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.element.targetMember.kind, "indexer");
  assert.equal(selected.element.targetParameterIndex, 0);
});

test("element selection requires exact provider signature evidence", () => {
  const fixture = createElementFixture({ includeProviderFact: false });
  const selected = selectCsharpTargetElement(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "source-owned");
  assert.match(selected.reason, /no provider declaration evidence/u);
});

test("provider member evidence alone cannot select an indexer signature", () => {
  const declaration = providerDeclaration({ signatureId: null });
  const fixture = createElementFixture({
    declaration,
    member: providerField(),
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.equal(
    selected.reason,
    "No related C# provider indexer satisfies the exact selected element access.",
  );
});

test("index arguments require an exact implicit target conversion", () => {
  const fixture = createElementFixture({
    argumentTarget: csharpStringTargetType(),
    targetParameterType: csharpSourcePrimitiveTargetType("int32"),
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.equal(
    selected.reason,
    "No related C# provider indexer satisfies the exact selected element access.",
  );
});

test("exact checked index arguments are accepted only on their selected relation", () => {
  const indexer = providerIndexer({
    parameters: [
      targetParameter(
        "key",
        csharpSourcePrimitiveTargetType("int32"),
        { csharpAcceptsCheckedSourceArgument: true },
      ),
    ],
  });
  const fixture = createElementFixture({
    member: indexer,
    argumentTarget: csharpStringTargetType(),
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
});

test("generic indexer results close from exact receiver representation", () => {
  const stringType = csharpStringTargetType();
  const binding = providerBinding({
    id: "Fixture.Dictionary`1",
    typeParameters: [{ name: "T" }],
  });
  const member = providerIndexer({
    id: "Fixture.Dictionary`1.Item(System.Int32)",
    declaringType: {
      kind: "target-named",
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", name: "T" }],
    },
    returnType: { kind: "type-parameter", name: "T" },
  });
  const fixture = createElementFixture({
    binding,
    member,
    receiverTarget: {
      kind: "target-named",
      id: binding.id,
      typeArguments: [stringType],
    },
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.element.targetMember.returnType, stringType);
});

test("readonly indexers reject exact source writes", () => {
  const fixture = createElementFixture({
    accessMode: "write",
    member: providerIndexer({ readonly: true }),
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
});

test("element selection rejects absent TSTS selected evidence", () => {
  const fixture = createElementFixture();
  const host = {
    ...fixture.host,
    semantics(sourceFile) {
      const semantics = fixture.host.semantics(sourceFile);
      return {
        ...semantics,
        getResolvedElementAccessInfo() {
          return undefined;
        },
      };
    },
  };
  const selected = selectCsharpProviderElement(
    host,
    fixture.expression,
    fixture.sourceFile,
  );
  assert.equal(selected.kind, "missing");
  assert.match(selected.reason, /did not resolve an exact source element access/u);
});

function createPropertyFixture(options = {}) {
  const declaration = options.declaration ?? providerDeclaration({
    signatureId: null,
  });
  const binding = options.binding ?? providerBinding();
  const member = options.member ?? providerField({
    id: "Fixture.Target.Value",
    targetName: "TargetValue",
    declaringTypeId: binding.id,
  });
  const source = propertyEvidence({
    ...(options.selectedSymbol === undefined
      ? {}
      : { selectedSymbol: options.selectedSymbol }),
    ...(options.selectedDeclaration === undefined
      ? {}
      : { selectedDeclaration: options.selectedDeclaration }),
    accessMode: options.accessMode ?? "read",
  });
  const relation = memberRelation({
    declaration,
    binding,
    member,
    ...(options.bindingTypeArgumentSource === undefined
      ? {}
      : { bindingTypeArgumentSource: options.bindingTypeArgumentSource }),
  });
  const facts = [
    ...(options.includeProviderFact === false
      ? []
      : [
          providerFact(
            source.evidence.selectedDeclaration ??
              source.evidence.selectedSymbol,
            declaration,
          ),
        ]),
    ...(options.additionalFacts ?? []),
  ];
  const receiverTarget = options.receiverTarget ?? {
    kind: "target-named",
    id: binding.id,
  };
  const direct = directProviderHost({
    relations: options.relations ?? [relation],
    facts,
    properties: [[source.expression, source.evidence]],
    nodeTypes: [[source.evidence.receiver.expression, receiverTarget]],
    semanticTypes: [
      [source.evidence.receiver.type, receiverTarget],
      [
        source.evidence.sourceReadType ?? source.evidence.sourceWriteType,
        member.returnType,
      ],
    ],
  });
  return {
    ...direct,
    expression: source.expression,
    evidence: source.evidence,
    declaration,
    binding,
    member,
    relation,
  };
}

function createElementFixture(options = {}) {
  const declaration = options.declaration ?? providerDeclaration();
  const binding = options.binding ?? providerBinding();
  const targetParameterType = options.targetParameterType ??
    csharpSourcePrimitiveTargetType("int32");
  const member = options.member ?? providerIndexer({
    declaringTypeId: binding.id,
    parameters: [targetParameter("index", targetParameterType)],
  });
  const source = elementEvidence({
    ...(options.selectedSymbol === undefined
      ? {}
      : { selectedSymbol: options.selectedSymbol }),
    accessMode: options.accessMode ?? "read",
  });
  const relation = declaration.signatureId === undefined
    ? memberRelation({ declaration, binding, member })
    : signatureRelation({
        declaration,
        binding,
        member,
        sourceParameters: [{
          sourceParameterIndex: 0,
          targetParameterIndex: 0,
          sourcePassingMode: "by-value",
          targetPassingMode: "by-value",
          sourceAcceptsOmission: false,
          targetAcceptsOmission: false,
          sourceRest: false,
          targetParamsArray: false,
        }],
      });
  const receiverTarget = options.receiverTarget ?? {
    kind: "target-named",
    id: binding.id,
  };
  const argumentTarget = options.argumentTarget ?? targetParameterType;
  const facts = options.includeProviderFact === false
    ? []
    : [providerFact(
        source.evidence.selectedDeclaration ??
          source.evidence.selectedSymbol,
        declaration,
      )];
  const direct = directProviderHost({
    relations: options.relations ?? [relation],
    facts,
    elements: [[source.expression, source.evidence]],
    nodeTypes: [
      [source.evidence.receiver.expression, receiverTarget],
      [source.evidence.argument.expression, argumentTarget],
    ],
    semanticTypes: [
      [source.evidence.receiver.type, receiverTarget],
      [source.evidence.argument.type, argumentTarget],
      [
        source.evidence.sourceReadType ?? source.evidence.sourceWriteType,
        member.returnType,
      ],
    ],
  });
  return {
    ...direct,
    expression: source.expression,
    evidence: source.evidence,
    declaration,
    binding,
    member,
    relation,
  };
}
