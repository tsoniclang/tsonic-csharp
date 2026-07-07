import { test, assert, runtimeCarrierFactKey, targetOperationFactKey, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, planExpression, planExpressionWithExpectedType, createDestructuringPlannerState, KindArrowFunction, KindArrayLiteralExpression, KindAwaitExpression, KindBigIntLiteral, KindConditionalExpression, KindIdentifier, KindNoSubstitutionTemplateLiteral, KindObjectLiteralExpression, KindParameter, KindPostfixUnaryExpression, KindPropertyAccessExpression, KindMethodDeclaration, KindPrefixUnaryExpression, KindRegularExpressionLiteral, KindThisKeyword, KindTemplateExpression, ModifierFlagsAsync, ModifierFlagsStatic, printCsharpExpression, csharpObjectShapeFactKey, csharpRegularExpressionLiteralFactKey, csharpTargetOperationFactKey, csharpBigIntegerTargetType, csharpDelegateTargetType, csharpNullableValueTargetType, csharpQualifiedTypeRenderShape, csharpStringTargetType, csharpSourcePrimitiveTargetType, csharpTargetNamedType, csharpTaskTargetType, csharpVoidTargetType, mapCsharpCheckedOperator, targetOperationFactsAreStructurallyIdentical, binary, conditional, awaitExpression, asyncArrowFunction, asyncArrowFunctionWithParameters, block, returnStatement, objectLiteral, propertyAssignment, objectShape, thisKeyword, node, parented, identifier, numericLiteral, propertyAccess, templateExpression, sourcePrimitiveCarrier, fakeOperatorHost, fakeOperatorHostWithSubjects, fakeObservationContext, factEntryKey, fakeInput, runtimeCarrierResolution, fakeAst } from "./operator-facts.helpers.mjs";

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
test("source-primitive increment records finalized operator token facts", () => {
  const operand = identifier("value");
  const expression = {
    Kind: KindPrefixUnaryExpression,
    Operand: operand,
  };
  const intType = csharpSourcePrimitiveTargetType("int32");
  const context = fakeObservationContext();
  const result = mapCsharpCheckedOperator({
    expression,
    operator: "++",
    left: operand,
    target: "csharp",
  }, context, fakeOperatorHost(intType));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.operation, {
    operationId: "tsonic.csharp.operator.++",
    operationKind: "operator",
    targetOperation: "++",
    resultType: intType,
  });
  assert.equal(context.writes.length, 1);
  assert.deepEqual(context.writes[0].value, {
    kind: "operator-token",
    operationId: "tsonic.csharp.operator.++",
    operator: "++",
    resultType: intType,
  });
});
test("nullish coalescing result uses nullable-left target type before expression carrier", () => {
  const left = identifier("maybeChar");
  const right = identifier("fallback");
  const expression = binary(left, right, "KindQuestionQuestionToken");
  const charType = csharpSourcePrimitiveTargetType("char");
  const nullableChar = csharpNullableValueTargetType(charType);
  const context = fakeObservationContext(new Map([
    [factEntryKey(expression, runtimeCarrierFactKey), { carrier: csharpStringTargetType() }],
  ]));
  const result = mapCsharpCheckedOperator({
    expression,
    operator: "??",
    left,
    right,
    target: "csharp",
  }, context, fakeOperatorHostWithSubjects(new Map([
    [left, nullableChar],
    [right, charType],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.operation.resultType, charType);
  assert.equal(context.writes.length, 1);
  assert.deepEqual(context.writes[0].value.resultType, charType);
});
test("checked numeric arithmetic widens finalized operator result facts from operand carriers", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const intType = csharpSourcePrimitiveTargetType("int32");
  const doubleType = csharpSourcePrimitiveTargetType("float64");
  const context = fakeObservationContext();
  const result = mapCsharpCheckedOperator({
    expression,
    operator: "+",
    left,
    right,
    target: "csharp",
  }, context, fakeOperatorHostWithSubjects(new Map([
    [left, intType],
    [right, doubleType],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.operation.resultType, doubleType);
  assert.equal(context.writes.length, 1);
  assert.deepEqual(context.writes[0].value.resultType, doubleType);
});
test("checked string concatenation records string result when either operand is string", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const context = fakeObservationContext();
  const result = mapCsharpCheckedOperator({
    expression,
    operator: "+",
    left,
    right,
    target: "csharp",
  }, context, fakeOperatorHostWithSubjects(new Map([
    [left, csharpSourcePrimitiveTargetType("int32")],
    [right, csharpStringTargetType()],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.operation.resultType, csharpStringTargetType());
  assert.equal(context.writes.length, 1);
  assert.deepEqual(context.writes[0].value.resultType, csharpStringTargetType());
});
test("target operation structural identity ignores checker-added provenance", () => {
  const expression = identifier("value");
  const operation = {
    operationId: "tsonic.csharp.operator.&",
    operationKind: "operator",
    targetOperation: "&",
    resultType: csharpSourcePrimitiveTargetType("int32"),
  };
  const operationWithProvenance = {
    ...operation,
    provenance: { sourceExpression: expression },
  };

  assert.equal(targetOperationFactsAreStructurallyIdentical(operationWithProvenance, operation), true);
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
test("destructuring assignment expressions emit closed lambda and return assigned source value from finalized facts", () => {
  const left = {
    Kind: KindArrayLiteralExpression,
    Elements: { Nodes: [identifier("first")] },
  };
  const right = identifier("values");
  const expression = binary(left, right, "KindEqualsToken");
  const diagnostics = [];
  const intType = csharpSourcePrimitiveTargetType("int32");

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
    runtimeCarrierFacts: new Map([[right, { carrier: { kind: "array", element: intType } }]]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), [
    "((System.Func<int[]>)(() =>",
    "{",
    "    int[] __tsonic_destructure0 = values;",
    "    first = __tsonic_destructure0[0];",
    "    return __tsonic_destructure0;",
    "}))()",
  ].join("\n"));
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
test("conditional expression emission requires finalized bool condition carrier facts", () => {
  const condition = identifier("value");
  const expression = conditional(condition, numericLiteral("1"), numericLiteral("2"));
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierSubject: condition,
    runtimeCarrier: sourcePrimitiveCarrier("int32"),
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Conditional expression condition requires a finalized C# bool runtime carrier/);
});
test("conditional expression emission consumes finalized bool condition carrier facts", () => {
  const condition = identifier("flag");
  const expression = conditional(condition, numericLiteral("1"), numericLiteral("2"));
  const diagnostics = [];

  const output = planExpressionWithExpectedType(expression, {}, fakeInput({
    runtimeCarrierSubject: condition,
    runtimeCarrier: sourcePrimitiveCarrier("bool"),
  }), diagnostics, { kind: "PredefinedType", name: "int" });

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "ConditionalExpression");
  assert.equal(printCsharpExpression(output), "flag ? 1 : 2");
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
test("postfix unary expression emission uses finalized selected target operator fact", () => {
  const operand = identifier("value");
  const expression = {
    Kind: KindPostfixUnaryExpression,
    Operand: operand,
  };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.++",
      operationKind: "operator",
      targetOperation: "++",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.++",
      operator: "++",
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output.operatorToken, { kind: "PlusPlusToken" });
  assert.equal(printCsharpExpression(output), "value++");
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