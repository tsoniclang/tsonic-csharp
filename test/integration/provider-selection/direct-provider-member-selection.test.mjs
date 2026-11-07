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
  valueRelation,
} from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { analyzeCsharpSource } from "../../helpers/direct-csharp-session.mjs";

// nextgen C-2542: the selectors take (host, node); Source evidence is the published SourceMemberAccessSelection /
// SourceElementAccessRecord, and Native carriers are keyed by node or published descriptor (F6 fixture options).
const fixtureDescriptor = () => Object.freeze({ kind: "declared", declaration: Object.freeze({}), typeArguments: Object.freeze([]) });

test("property selection uses the exact provider member identity, not its spelling", () => {
  const fixture = createPropertyFixture();
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
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
  );
  assert.equal(selected.kind, "source-owned");
  assert.match(selected.reason, /no provider declaration evidence/u);
});

// nextgen C-2542: a Host member selection carries declarations, never a Symbol, so the old `selectedSymbol: null`
// option is gone; this case is the declaration-only selection.
test("property selection accepts exact declaration evidence without a selected symbol", () => {
  const fixture = createPropertyFixture();
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "resolved");
});

test("namespace property selection consumes an exact provider export value", () => {
  const declaration = providerDeclaration({
    memberId: null,
    memberKey: null,
    memberStatic: null,
    signatureId: null,
  });
  const binding = providerBinding();
  const member = providerField({
    id: "Fixture.Module.Value",
    targetName: "Value",
    declaringTypeId: binding.id,
    static: true,
  });
  const relation = valueRelation({ declaration, binding, member });
  const fixture = createPropertyFixture({
    declaration,
    binding,
    member,
    relation,
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.property.relation.kind, "value");
  assert.deepEqual(selected.property.receiver, { kind: "none" });
  assert.equal(selected.property.targetMember.id, member.id);
});

test("contradictory selected property subjects fail closed", () => {
  // The two contradictory subjects are two selected declarations (the old Symbol subject is a second declaration).
  const otherDeclaration = {};
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
    selectedDeclaration,
    additionalDeclarations: [otherDeclaration],
    additionalFacts: [providerFact(otherDeclaration, second)],
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "conflict");
  assert.match(selected.reason, /contradictory provider identities/u);
});

test("generic property members close from exact receiver representation", () => {
  const stringType = csharpStringTargetType();
  const binding = providerBinding({
    id: "Fixture.Box`1",
    typeParameters: [{ identity: "T", name: "T" }],
  });
  const member = providerField({
    id: "Fixture.Box`1.Value",
    targetName: "Value",
    declaringType: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", identity: "T", name: "T" }],
    },
    returnType: { kind: "type-parameter", identity: "T", name: "T" },
  });
  const fixture = createPropertyFixture({
    binding,
    member,
    receiverTarget: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
      id: binding.id,
      typeArguments: [stringType],
    },
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.property.targetMember.returnType, stringType);
});

test("structural property bindings close from exact receiver representation", () => {
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const typeParameter = { kind: "type-parameter", identity: "T", name: "T" };
  const binding = providerBinding({
    id: "Fixture.Array`1",
    typeParameters: [{ identity: "T", name: "T" }],
    csharpType: { kind: "array", element: typeParameter },
  });
  const member = providerField({
    id: "Fixture.Array`1.Length",
    targetName: "Length",
    declaringType: { kind: "array", element: typeParameter },
    returnType: int32,
  });
  const fixture = createPropertyFixture({
    binding,
    member,
    receiverTarget: { kind: "array", element: int32 },
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.property.targetMember.declaringType, {
    kind: "array",
    element: int32,
  });
});

test("readonly target properties reject exact source writes", () => {
  const fixture = createPropertyFixture({
    accessMode: "write",
    member: providerField({ readonly: true }),
  });
  const selected = selectCsharpProviderProperty(
    fixture.host,
    fixture.expression,
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
  );
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.property.targetMember.kind, "field");
});

test("element selection uses declaration-only index-signature evidence", () => {
  const fixture = createElementFixture();
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
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
  );
  assert.equal(selected.kind, "missing");
  assert.equal(
    selected.reason,
    "No related C# provider indexer satisfies the exact selected element access.",
  );
});

test("index arguments preserve exact syntax-owned source primitive evidence", () => {
  const fixture = createElementFixture({
    argumentTarget: csharpSourcePrimitiveTargetType("float64"),
    argumentNodeTarget: csharpSourcePrimitiveTargetType("int32"),
    targetParameterType: csharpSourcePrimitiveTargetType("int32"),
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "resolved");
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
  );
  assert.equal(selected.kind, "resolved");
});

test("generic indexer results close from exact receiver representation", () => {
  const stringType = csharpStringTargetType();
  const binding = providerBinding({
    id: "Fixture.Dictionary`1",
    typeParameters: [{ identity: "T", name: "T" }],
  });
  const member = providerIndexer({
    id: "Fixture.Dictionary`1.Item(System.Int32)",
    declaringType: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
      id: binding.id,
      typeArguments: [{ kind: "type-parameter", identity: "T", name: "T" }],
    },
    returnType: { kind: "type-parameter", identity: "T", name: "T" },
  });
  const fixture = createElementFixture({
    binding,
    member,
    receiverTarget: {
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
      id: binding.id,
      typeArguments: [stringType],
    },
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.element.targetMember.returnType, stringType);
});

test("structural indexer bindings close from exact receiver representation", () => {
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const typeParameter = { kind: "type-parameter", identity: "T", name: "T" };
  const binding = providerBinding({
    id: "Fixture.Array`1",
    typeParameters: [{ identity: "T", name: "T" }],
    csharpType: { kind: "array", element: typeParameter },
  });
  const member = providerIndexer({
    id: "Fixture.Array`1.Item(System.Int32)",
    declaringType: { kind: "array", element: typeParameter },
    returnType: typeParameter,
  });
  const fixture = createElementFixture({
    binding,
    member,
    receiverTarget: { kind: "array", element: int32 },
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.element.targetMember.returnType, int32);
});

test("readonly indexers reject exact source writes", () => {
  const fixture = createElementFixture({
    accessMode: "write",
    member: providerIndexer({ readonly: true }),
  });
  const selected = selectCsharpProviderElement(
    fixture.host,
    fixture.expression,
  );
  assert.equal(selected.kind, "missing");
});

// nextgen C-2542: the test "element selection rejects absent TSTS selected evidence" is removed. facts.values.elementAccess
// is total for an element access (I4), so absent Source evidence is not a selectable state; the selector's
// "did not resolve an exact source element access" branch is deleted.

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
  const receiverType = fixtureDescriptor();
  const resultType = fixtureDescriptor();
  const published = propertyEvidence({
    ...(options.selectedDeclaration === undefined
      ? {}
      : { selectedDeclaration: options.selectedDeclaration }),
    accessMode: options.accessMode ?? "read",
    receiverType,
    readType: resultType,
    writeType: resultType,
  });
  const source = options.additionalDeclarations === undefined ? published : { ...published,
    evidence: Object.freeze({ ...published.evidence, selected: Object.freeze({ kind: "member",
      declarations: Object.freeze([...published.evidence.selected.declarations, ...options.additionalDeclarations]) }) }) };
  const relation = options.relation ?? memberRelation({
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
          providerFact(source.evidence.selected.declarations[0], declaration),
        ]),
    ...(options.additionalFacts ?? []),
  ];
  const receiverTarget = options.receiverTarget ?? {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
    id: binding.id,
  };
  const direct = directProviderHost({
    relations: options.relations ?? [relation],
    facts,
    properties: [[source.expression, source.evidence]],
    nodeTypes: [[source.evidence.receiver, receiverTarget], [source.expression, member.returnType]],
    descriptorTypes: [[receiverType, receiverTarget], [resultType, member.returnType]],
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
  const argumentCarrier = options.argumentNodeTarget ?? options.argumentTarget ?? targetParameterType;
  const argumentType = argumentCarrier.name === "int32" ? "int32" : argumentCarrier.name === "float64" ? "number" : "string";
  const checked = analyzeCsharpSource({ sourceText: `import type { int32 } from "@tsonic/core/types.js";
    ${options.includeProviderFact === false ? 'import type { FixtureReceiver } from "./fixture-receiver.js";'
      : 'interface FixtureReceiver { [index: string]: unknown; [index: number]: unknown; }'}
    export function read(receiver: FixtureReceiver, index: ${argumentType}): void {
      ${options.accessMode === "write" ? "receiver[index] = undefined;" : "void receiver[index];"}
    }`, ...(options.includeProviderFact === false ? { files: {
      "fixture-receiver.d.ts": "export interface FixtureReceiver { [index: string]: unknown; [index: number]: unknown; }",
    } } : {}) });
  assert.equal(checked.sourceDiagnosticsText, "", "the Native index relation has its own checked Source occurrence");
  // The Source facts program the C# session built (createTargetSourceProgram needs the composition's profile).
  const program = checked.source;
  const ast = program.syntax;
  const accesses = [];
  const visit = node => {
    if (ast.is.IsElementAccessExpression(node)) accesses.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(file => { if (!ast.isDeclarationFile(file)) visit(file); });
  assert.equal(accesses.length, 1);
  const source = { expression: accesses[0], evidence: program.facts.values.elementAccess(accesses[0]) };
  assert.equal(source.evidence?.node === source.expression, true,
    "the exact access, index and declaration are retained with the actual Host publication");
  const selectedDeclaration = source.evidence.selected.kind === "member" || source.evidence.selected.kind === "index-signature"
    ? source.evidence.selected.declaration : undefined;
  assert.equal(selectedDeclaration !== undefined, true,
    "the selected index-signature declaration supplies the original declaration-only evidence");
  if (options.includeProviderFact === false) assert.equal(
    !program.facts.navigation.identity.isProjectDeclaration(selectedDeclaration) &&
    ast.isDeclarationFile(ast.getSourceFile(selectedDeclaration)), true,
  "the no-provider boundary uses a real external declaration, never a project indexer with missing Native inputs");
  const argumentExpression = ast.as.AsElementAccessExpression(source.expression)?.ArgumentExpression;
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
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
    id: binding.id,
  };
  const argumentTarget = options.argumentTarget ?? targetParameterType;
  const argumentNodeTarget = options.argumentNodeTarget ?? argumentTarget;
  const facts = options.includeProviderFact === false
    ? []
    : [providerFact(selectedDeclaration, declaration)];
  const direct = directProviderHost({
    sourceProgram: program,
    relations: options.relations ?? [relation],
    facts,
    elements: [[source.expression, source.evidence]],
    nodeTypes: [
      [source.evidence.receiver, receiverTarget],
      [argumentExpression, argumentNodeTarget],
      [source.expression, member.returnType],
    ],
    descriptorTypes: [
      [source.evidence.receiverType, receiverTarget],
      [source.evidence.index, argumentTarget],
      [source.evidence.result, member.returnType],
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
