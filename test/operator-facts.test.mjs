import { test } from "node:test";
import assert from "node:assert/strict";
import { targetOperationFactKey } from "@tsonic/tsts";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planExpression, planExpressionWithExpectedType } from "../dist/backend/planner/expressions.js";
import {
  KindArrayLiteralExpression,
  KindAwaitExpression,
  KindBigIntLiteral,
  KindIdentifier,
  KindNoSubstitutionTemplateLiteral,
  KindObjectLiteralExpression,
  KindPropertyAccessExpression,
  KindPrefixUnaryExpression,
  KindRegularExpressionLiteral,
  KindTemplateExpression,
} from "../dist/backend/planner/source-ast.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";
import {
  csharpRegularExpressionLiteralFactKey,
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpBigIntegerTargetType,
  csharpQualifiedTypeRenderShape,
  csharpStringTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpTaskTargetType,
  csharpVoidTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  mapCsharpCheckedOperator,
} from "../dist/source/csharp-source-semantics/checked-operator-mapping/index.js";

test("binary expression emission requires selected target operator fact even for source primitives", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierSubject: left,
    runtimeCarrier: sourcePrimitiveCarrier("int32"),
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /C# binary operator emission requires a selected provider operator fact/);
  assert.match(diagnostics[0].message, /operand node runtime carrier/);
});

test("binary expression emission uses the finalized selected target operator fact", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.add",
      operationKind: "operator",
      targetOperation: "+",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.add",
      operator: "+",
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output.operatorToken, { kind: "PlusToken" });
  assert.equal(printCsharpExpression(output), "left + right");
});

test("checked provider-owned binary operators fail closed without selected provider operator identity", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const providerType = csharpTargetNamedType("ProviderOperators.Number", undefined, csharpQualifiedTypeRenderShape("ProviderOperators", "Number"));
  const context = fakeObservationContext();
  const result = mapCsharpCheckedOperator({
    expression,
    operator: "+",
    left,
    right,
    target: "csharp",
  }, context, fakeOperatorHost(providerType));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_OPERATOR_NOT_MAPPED");
  assert.match(result.diagnostic.message, /requires an exact finalized provider operator identity selected by TSTS/u);
  assert.equal(context.writes.length, 0);
});

test("checked provider-owned binary operators consume finalized exact provider operator identity", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const providerType = csharpTargetNamedType("ProviderOperators.Number", undefined, csharpQualifiedTypeRenderShape("ProviderOperators", "Number"));
  const selectedOperation = {
    operationId: "ProviderOperators.Number.op_Addition(ProviderOperators.Number,ProviderOperators.Number)",
    operationKind: "operator",
    targetOperation: "op_Addition",
    resultType: providerType,
  };
  const context = fakeObservationContext(new Map([
    [factEntryKey(expression, targetOperationFactKey), selectedOperation],
  ]));
  const result = mapCsharpCheckedOperator({
    expression,
    operator: "+",
    left,
    right,
    target: "csharp",
  }, context, fakeOperatorHost(providerType));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation, selectedOperation);
  assert.equal(context.writes.length, 0);
});

test("assignment expression emission uses canonical assignment AST", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.assign",
      operationKind: "operator",
      targetOperation: "=",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.assign",
      operator: "=",
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "AssignmentExpression");
  assert.deepEqual(output.operatorToken, { kind: "EqualsToken" });
  assert.equal(printCsharpExpression(output), "left = right");
});

test("assignment expression fails closed when provider-owned storage lacks selected target facts", () => {
  const receiver = identifier("target");
  const left = propertyAccess(receiver, "value");
  const right = identifier("source");
  const expression = binary(left, right, "KindEqualsToken");
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.assign",
      operationKind: "operator",
      targetOperation: "=",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.assign",
      operator: "=",
    },
    targetBindingSubject: receiver,
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /C# property access 'value' must be selected by TSTS\/provider facts before emission/);
});

test("destructuring assignment fails closed without finalized storage facts", () => {
  const left = {
    Kind: KindArrayLiteralExpression,
    Elements: { Nodes: [identifier("first")] },
  };
  const right = identifier("source");
  const expression = binary(left, right, "KindEqualsToken");
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.assign",
      operationKind: "operator",
      targetOperation: "=",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.assign",
      operator: "=",
    },
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Destructuring assignment emission requires finalized target storage and extraction facts/);
});

test("object destructuring assignment fails closed before ordinary assignment emission", () => {
  const left = {
    Kind: KindObjectLiteralExpression,
    Properties: { Nodes: [{ Kind: "KindShorthandPropertyAssignment", name: identifier("first") }] },
  };
  const right = identifier("source");
  const expression = binary(left, right, "KindEqualsToken");
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.assign",
      operationKind: "operator",
      targetOperation: "=",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.assign",
      operator: "=",
    },
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Destructuring assignment emission requires finalized target storage and extraction facts/);
});

test("nullish coalescing expected-type emission consumes finalized operator result facts", () => {
  const left = identifier("maybeValue");
  const right = identifier("fallbackValue");
  const expression = binary(left, right, "KindQuestionQuestionToken");
  const intType = csharpSourcePrimitiveTargetType("int32");
  const diagnostics = [];

  const output = planExpressionWithExpectedType(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.??",
      operationKind: "operator",
      targetOperation: "??",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.??",
      operator: "??",
      resultType: intType,
    },
  }), diagnostics, { kind: "PredefinedType", name: "int" });

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), "maybeValue ?? fallbackValue");
});

test("nullish coalescing expected-type emission fails closed without finalized result type", () => {
  const left = identifier("maybeValue");
  const right = identifier("fallbackValue");
  const expression = binary(left, right, "KindQuestionQuestionToken");
  const diagnostics = [];

  const output = planExpressionWithExpectedType(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.??",
      operationKind: "operator",
      targetOperation: "??",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.??",
      operator: "??",
    },
  }), diagnostics, { kind: "PredefinedType", name: "int" });

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized operator result target type/);
});

test("nullish equality emission maps checked undefined operands to C# null", () => {
  const left = identifier("value");
  const right = identifier("undefined");
  const expression = binary(left, right, "KindEqualsEqualsToken");
  const nullishType = { kind: "nullish-type" };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.==",
      operationKind: "operator",
      targetOperation: "==",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.==",
      operator: "==",
      resultType: csharpSourcePrimitiveTargetType("bool"),
    },
    typeAtLocations: new Map([[right, nullishType]]),
    nullishTypes: new Set([nullishType]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), "value == null");
});

test("operator token facts must map to supported Roslyn tokens", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "example.raw",
      operationKind: "operator",
      targetOperation: "raw",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "example.raw",
      operator: "raw C# fragment",
    },
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /unsupported finalized operator token 'raw C# fragment'/);
});

test("prefix unary expression emission requires selected target operator fact", () => {
  const operand = identifier("value");
  const expression = {
    Kind: KindPrefixUnaryExpression,
    Operand: operand,
  };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierSubject: operand,
    runtimeCarrier: sourcePrimitiveCarrier("int32"),
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /C# prefix unary operator emission requires a selected provider operator fact/);
});

test("bigint literal emission requires finalized runtime carrier fact", () => {
  const expression = {
    Kind: KindBigIntLiteral,
    Text: "1_000n",
  };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput(), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /BigInt literal emission requires a finalized runtime carrier fact/);
});

test("bigint literal carrier diagnostics preserve resolver reason and evidence", () => {
  const expression = {
    Kind: KindBigIntLiteral,
    Text: "1n",
  };
  const diagnostics = [];

  planExpression(expression, {}, fakeInput({
    missingRuntimeCarrierReason: "BigInt literal target primitive fact was not finalized",
    missingRuntimeCarrierEvidence: [{ message: "source primitive bigint lacked System.Numerics.BigInteger mapping" }],
  }), diagnostics);

  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /BigInt literal target primitive fact was not finalized/);
  assert.deepEqual(diagnostics[0].evidence, ["source primitive bigint lacked System.Numerics.BigInteger mapping"]);
});

test("bigint literal emission uses finalized BigInteger carrier and Roslyn AST", () => {
  const expression = {
    Kind: KindBigIntLiteral,
    Text: "1_000n",
  };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierSubject: expression,
    runtimeCarrier: {
      carrier: csharpBigIntegerTargetType(),
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "InvocationExpression");
  assert.equal(printCsharpExpression(output), 'System.Numerics.BigInteger.Parse("1000")');
});

test("RegExp literal emission requires finalized runtime carrier facts", () => {
  const expression = {
    Kind: KindRegularExpressionLiteral,
    Text: "/value/g",
  };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    regexpLiteralSubject: expression,
    regexpLiteral: { pattern: "value", flags: "g" },
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /RegExp literal emission requires a finalized JS surface RegExp runtime carrier fact/);
});

test("RegExp literal emission uses finalized RegExp carrier and constructor operation facts", () => {
  const expression = {
    Kind: KindRegularExpressionLiteral,
    Text: "/value/g",
  };
  const regExpType = csharpTargetNamedType("Tsonic.CSharp.Js.RegExp", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExp"));
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    regexpLiteralSubject: expression,
    regexpLiteral: { pattern: "value", flags: "g" },
    runtimeCarrierSubject: expression,
    runtimeCarrier: { carrier: regExpType },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "member",
      operationId: "tsonic.csharp.js.regexp.literal.constructor",
      operationKind: "constructor",
      memberName: "RegExp",
      declaringType: regExpType,
      resultType: regExpType,
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), 'new Tsonic.CSharp.Js.RegExp("value", "g")');
});

test("template expression emission requires finalized string carrier facts", () => {
  const expression = templateExpression("hello ", identifier("name"), "!");
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput(), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Template string emission requires a finalized target string runtime carrier fact/);
});

test("template expression emission uses finalized string carrier facts and Roslyn interpolated string AST", () => {
  const expression = templateExpression("hello ", identifier("name"), "!");
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierSubject: expression,
    runtimeCarrier: { carrier: csharpStringTargetType() },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "InterpolatedStringExpression");
  assert.equal(printCsharpExpression(output), '$"hello {name}!"');
});

test("no-substitution template literal requires finalized string carrier facts", () => {
  const expression = {
    Kind: KindNoSubstitutionTemplateLiteral,
    Text: "plain",
  };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput(), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /No-substitution template literal emission requires a finalized target string runtime carrier fact/);
});

test("await expression emission requires finalized awaited Promise/Task carrier facts", () => {
  const awaited = identifier("task");
  const expression = awaitExpression(awaited);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierFacts: new Map([
      [expression, sourcePrimitiveCarrier("int32")],
    ]),
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Await expression emission requires a finalized Promise\/Task target carrier fact/);
});

test("await expression emission rejects mismatched await-result carrier facts", () => {
  const awaited = identifier("task");
  const expression = awaitExpression(awaited);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierFacts: new Map([
      [awaited, { carrier: csharpTaskTargetType(csharpSourcePrimitiveTargetType("int32")) }],
      [expression, { carrier: csharpStringTargetType() }],
    ]),
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /await-result carrier to match the awaited Promise\/Task result carrier/);
});

test("await expression emission uses finalized Promise/Task result facts and Roslyn AST", () => {
  const awaited = identifier("task");
  const expression = awaitExpression(awaited);
  const resultType = csharpSourcePrimitiveTargetType("int32");
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierFacts: new Map([
      [awaited, { carrier: csharpTaskTargetType(resultType) }],
      [expression, { carrier: resultType }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "AwaitExpression");
  assert.equal(printCsharpExpression(output), "await task");
});

test("await expression statement allows finalized non-generic Task carrier", () => {
  const awaited = identifier("task");
  const expression = awaitExpression(awaited);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierFacts: new Map([
      [awaited, { carrier: csharpTaskTargetType(csharpVoidTargetType()) }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "AwaitExpression");
  assert.equal(printCsharpExpression(output), "await task");
});

function binary(left, right, operatorKind = "KindPlusToken") {
  return {
    Kind: "KindBinaryExpression",
    Left: left,
    Right: right,
    OperatorToken: { Kind: operatorKind },
  };
}

function awaitExpression(expression) {
  return {
    Kind: KindAwaitExpression,
    Expression: expression,
  };
}

function identifier(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

function propertyAccess(receiver, name) {
  return {
    Kind: KindPropertyAccessExpression,
    Expression: receiver,
    name: identifier(name),
  };
}

function templateExpression(head, expression, tail) {
  return {
    Kind: KindTemplateExpression,
    Head: { Text: head },
    TemplateSpans: {
      Nodes: [{
        Expression: expression,
        Literal: { Text: tail },
      }],
    },
  };
}

function sourcePrimitiveCarrier(name) {
  return {
    carrier: {
      kind: "source-primitive",
      name,
    },
  };
}

function fakeOperatorHost(providerType) {
  const binding = {
    id: providerType.id,
    target: "csharp",
    kind: "struct",
    sourceName: "Number",
    targetName: "ProviderOperators.Number",
  };
  return {
    getTargetTypeRefForSubject: (subject) => subject?.Kind === KindIdentifier ? providerType : undefined,
    getCsharpTargetBindingByTargetId: (targetId) => targetId === providerType.id ? binding : undefined,
  };
}

function fakeObservationContext(entries = new Map()) {
  const writes = [];
  return {
    writes,
    extensionId: "tsonic.csharp.operations",
    facts: {
      get: (subject, key) => entries.get(factEntryKey(subject, key)),
      set: (subject, key, value, evidence = []) => {
        writes.push({ subject, key, value, evidence });
        entries.set(factEntryKey(subject, key), value);
        return "inserted";
      },
    },
    factResolver: {
      resolve: (subject, key) => entries.get(factEntryKey(subject, key)),
    },
  };
}

function factEntryKey(subject, key) {
  return `${subject?.Text ?? subject?.Kind ?? "subject"}:${key.id}`;
}

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: (subject) => subject === options.selectedOperatorSubject ? options.selectedOperator : undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) =>
        options.runtimeCarrierFacts?.get(subject) ??
        (subject === options.runtimeCarrierSubject
          ? options.runtimeCarrier
          : undefined),
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: (subject) => subject !== undefined && subject === options.targetBindingSubject
        ? { target: "csharp", id: "Example.Target", sourceName: "Target", targetName: "Target", kind: "class" }
        : undefined,
      getSourcePrimitiveFact: (subject) => subject === options.sourcePrimitiveSubject
        ? { kind: "int32", runtimeBase: "number", signed: true, width: 32 }
        : undefined,
      getFact: (subject, key) => {
        if (subject === options.csharpOperationSubject && key === csharpTargetOperationFactKey) {
          return options.csharpOperation;
        }
        if (subject === options.regexpLiteralSubject && key === csharpRegularExpressionLiteralFactKey) {
          return options.regexpLiteral;
        }
        return undefined;
      },
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: (subject) => options.typeAtLocations?.get(subject) ?? options.typeAtLocation,
      getTypeFromTypeNode: () => options.typeAtLocation,
      describeTypeAtLocation: () => undefined,
      isProjectSourceShapeForNode: () => false,
      isProjectSourceConstructibleObjectForNode: () => false,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => runtimeCarrierResolution(options, subject),
      resolveRuntimeCarrierForNode: (subject) => runtimeCarrierResolution(options, subject),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
    types: {
      isAny: () => false,
      isUnknown: () => false,
      isNumberLike: () => false,
      isStringLike: () => false,
      isBooleanLike: () => false,
      isBigIntLike: () => false,
      isVoidLike: () => false,
      isUnion: () => false,
      isTuple: () => false,
      isArrayLike: () => false,
      isTypeReference: () => false,
      isNullish: (type) => options.nullishTypes?.has(type) === true,
      getCallSignatures: () => [],
      getReturnTypeOfSignature: () => undefined,
      getUnionOrIntersectionTypes: () => [],
      getTupleElementTypes: () => [],
      getTypeArguments: () => [],
      getIndexInfos: () => [],
      getTypeReferenceTarget: (type) => type,
    },
  };
}

function runtimeCarrierResolution(options, subject) {
  const fact = options.runtimeCarrierFacts?.get(subject) ??
    (subject === options.runtimeCarrierSubject ? options.runtimeCarrier : undefined);
  return fact === undefined
    ? missingCarrierResolution(options.missingRuntimeCarrierReason, options.missingRuntimeCarrierEvidence)
    : resolvedCarrierResolution(fact.carrier);
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getSourceFile: () => undefined,
  is: {
    IsKeywordTypeNode: () => false,
    IsTypeReferenceNode: () => false,
    IsUnionTypeNode: () => false,
    IsIntersectionTypeNode: () => false,
    IsConditionalTypeNode: () => false,
    IsInferTypeNode: () => false,
    IsArrayTypeNode: () => false,
    IsIndexedAccessTypeNode: () => false,
    IsLiteralTypeNode: () => false,
    IsThisTypeNode: () => false,
    IsMappedTypeNode: () => false,
    IsTupleTypeNode: () => false,
    IsOptionalTypeNode: () => false,
    IsRestTypeNode: () => false,
    IsParenthesizedTypeNode: () => false,
    IsFunctionTypeNode: () => false,
    IsConstructorTypeNode: () => false,
    IsTemplateLiteralTypeNode: () => false,
    IsImportTypeNode: () => false,
  },
};
