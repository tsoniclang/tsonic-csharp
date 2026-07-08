import { test, assert, runtimeCarrierFactKey, targetOperationFactKey, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, planExpression, planExpressionWithExpectedType, createDestructuringPlannerState, KindArrowFunction, KindArrayLiteralExpression, KindAwaitExpression, KindBigIntLiteral, KindConditionalExpression, KindIdentifier, KindNoSubstitutionTemplateLiteral, KindObjectLiteralExpression, KindParameter, KindPostfixUnaryExpression, KindPropertyAccessExpression, KindMethodDeclaration, KindPrefixUnaryExpression, KindRegularExpressionLiteral, KindThisKeyword, KindTemplateExpression, ModifierFlagsAsync, ModifierFlagsStatic, printCsharpExpression, csharpObjectShapeFactKey, csharpRegularExpressionLiteralFactKey, csharpTargetOperationFactKey, csharpBigIntegerTargetType, csharpDelegateTargetType, csharpNullableValueTargetType, csharpQualifiedTypeRenderShape, csharpStringTargetType, csharpSourcePrimitiveTargetType, csharpTargetNamedType, csharpTaskTargetType, csharpVoidTargetType, mapCsharpCheckedOperator, targetOperationFactsAreStructurallyIdentical, binary, conditional, awaitExpression, asyncArrowFunction, asyncArrowFunctionWithParameters, block, returnStatement, objectLiteral, propertyAssignment, objectShape, thisKeyword, node, parented, identifier, numericLiteral, propertyAccess, templateExpression, sourcePrimitiveCarrier, fakeOperatorHost, fakeOperatorHostWithSubjects, fakeObservationContext, factEntryKey, fakeInput, runtimeCarrierResolution, fakeAst } from "./operator-facts.helpers.mjs";

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
      [expression, { carrier: csharpVoidTargetType() }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "AwaitExpression");
  assert.equal(printCsharpExpression(output), "await task");
});
test("await expression statement rejects missing void await-result carrier facts", () => {
  const awaited = identifier("task");
  const expression = awaitExpression(awaited);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierFacts: new Map([
      [awaited, { carrier: csharpTaskTargetType(csharpVoidTargetType()) }],
    ]),
  }), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /await-result carrier to match the awaited Promise\/Task result carrier/);
});
test("this expression emission requires finalized instance receiver facts", () => {
  const thisExpression = thisKeyword();
  const method = parented(node(KindMethodDeclaration, {}), node("KindClassDeclaration"));
  thisExpression.Parent = method;
  const receiverType = csharpTargetNamedType("Counter");
  const diagnostics = [];

  const output = planExpression(thisExpression, {}, fakeInput({
    runtimeCarrierFacts: new Map([
      [thisExpression, { carrier: receiverType }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "IdentifierName");
  assert.equal(printCsharpExpression(output), "this");
});
test("this expression emission accepts lexical arrows only through an instance receiver", () => {
  const thisExpression = thisKeyword();
  const arrow = node(KindArrowFunction, {});
  const method = parented(node(KindMethodDeclaration, {}), node("KindClassDeclaration"));
  thisExpression.Parent = arrow;
  arrow.Parent = method;
  const diagnostics = [];

  const output = planExpression(thisExpression, {}, fakeInput({
    runtimeCarrierFacts: new Map([
      [thisExpression, { carrier: csharpTargetNamedType("Counter") }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "IdentifierName");
  assert.equal(printCsharpExpression(output), "this");
});
test("this expression emission rejects dynamic and static receiver contexts", () => {
  const staticThis = thisKeyword();
  const staticMethod = parented(node(KindMethodDeclaration, { ModifierFlags: ModifierFlagsStatic }), node("KindClassDeclaration"));
  staticThis.Parent = staticMethod;
  const functionThis = thisKeyword();
  functionThis.Parent = node("KindFunctionDeclaration");
  const topLevelThis = thisKeyword();
  topLevelThis.Parent = node("KindSourceFile");
  const objectMethodThis = thisKeyword();
  objectMethodThis.Parent = parented(node(KindMethodDeclaration), node(KindObjectLiteralExpression));
  const fieldInitializerThis = thisKeyword();
  fieldInitializerThis.Parent = parented(node("KindPropertyDeclaration"), node("KindClassDeclaration"));
  const diagnostics = [];

  assert.equal(planExpression(staticThis, {}, fakeInput(), diagnostics), undefined);
  assert.equal(planExpression(functionThis, {}, fakeInput(), diagnostics), undefined);
  assert.equal(planExpression(topLevelThis, {}, fakeInput(), diagnostics), undefined);
  assert.equal(planExpression(objectMethodThis, {}, fakeInput(), diagnostics), undefined);
  assert.equal(planExpression(fieldInitializerThis, {}, fakeInput(), diagnostics), undefined);

  assert.equal(diagnostics.length, 5);
  assert.match(diagnostics[0].message, /static class member receiver/);
  assert.match(diagnostics[1].message, /runtime-bound function receiver/);
  assert.match(diagnostics[2].message, /top-level module receiver/);
  assert.match(diagnostics[3].message, /object-literal or non-class method receiver/);
  assert.match(diagnostics[4].message, /class field initializer receiver/);
});
test("this expression emission fails closed without receiver carrier facts", () => {
  const thisExpression = thisKeyword();
  const method = parented(node(KindMethodDeclaration, {}), node("KindClassDeclaration"));
  thisExpression.Parent = method;
  const diagnostics = [];

  const output = planExpression(thisExpression, {}, fakeInput(), diagnostics);

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized runtime carrier fact for the TSTS-selected instance receiver/);
});
test("async lambda emission accepts finalized Task-returning delegate facts", () => {
  const sourceExample = `
    const callback: () => Promise<number> = async () => 1;
  `;
  assert.match(sourceExample, /Promise<number>/);
  assert.match(sourceExample, /async \(\) => 1/);
  const resultType = csharpSourcePrimitiveTargetType("int32");
  const delegateType = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(resultType));
  const expression = asyncArrowFunction(numericLiteral("1"));
  const diagnostics = [];

  const output = planExpressionWithExpectedType(
    expression,
    {},
    fakeInput(),
    diagnostics,
    { kind: "IdentifierName", name: "Func" },
    undefined,
    undefined,
    delegateType,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "LambdaExpression");
  assert.equal(output.async, true);
  assert.equal(printCsharpExpression(output), "async () => 1");
});
test("async callback lambda emission uses finalized parameter and await Task facts", () => {
  const sourceExample = `
    const callback: (task: Promise<int32>) => Promise<int32> = async (task) => await task;
  `;
  assert.match(sourceExample, /Promise<int32>/);
  assert.match(sourceExample, /await task/);
  const resultType = csharpSourcePrimitiveTargetType("int32");
  const taskType = csharpTaskTargetType(resultType);
  const delegateType = csharpDelegateTargetType("System.Func", [taskType], taskType);
  const taskParameterName = identifier("task");
  const awaited = awaitExpression(taskParameterName);
  const expression = asyncArrowFunctionWithParameters([
    node(KindParameter, { name: taskParameterName }),
  ], awaited);
  const diagnostics = [];

  const output = planExpressionWithExpectedType(
    expression,
    {},
    fakeInput({
      runtimeCarrierFacts: new Map([
        [taskParameterName, { carrier: taskType }],
        [awaited, { carrier: resultType }],
      ]),
    }),
    diagnostics,
    { kind: "IdentifierName", name: "Func" },
    undefined,
    undefined,
    delegateType,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "LambdaExpression");
  assert.equal(output.async, true);
  assert.equal(printCsharpExpression(output), "async (System.Threading.Tasks.Task<int> task) => await task");
});
test("async lambda emission rejects non-Task delegate return facts", () => {
  const sourceExample = `
    const callback: () => number = async () => 1;
  `;
  assert.match(sourceExample, /\(\) => number/);
  const resultType = csharpSourcePrimitiveTargetType("int32");
  const delegateType = csharpDelegateTargetType("System.Func", [], resultType);
  const expression = asyncArrowFunction(numericLiteral("1"));
  const diagnostics = [];

  const output = planExpressionWithExpectedType(
    expression,
    {},
    fakeInput(),
    diagnostics,
    { kind: "IdentifierName", name: "Func" },
    undefined,
    undefined,
    delegateType,
  );

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Async lambda emission requires a finalized Task\/Promise-returning delegate carrier fact/);
});
test("async lambda expression bodies use finalized Task result object-shape facts", () => {
  const sourceExample = `
    const callback: () => Promise<{ value: int32 }> = async () => ({ value: 1 });
  `;
  assert.match(sourceExample, /Promise<\{ value: int32 \}>/);
  assert.match(sourceExample, /async \(\) => \(\{ value: 1 \}\)/);
  const resultType = csharpTargetNamedType("__AsyncResult", undefined, { kind: "named", name: "__AsyncResult" });
  const resultShape = objectShape(resultType, [{
    sourceName: "value",
    targetName: "value",
    memberKind: "property",
    type: csharpSourcePrimitiveTargetType("int32"),
  }]);
  const delegateType = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(resultType));
  const expression = asyncArrowFunction(objectLiteral([
    propertyAssignment(identifier("value"), numericLiteral("1")),
  ]));
  const diagnostics = [];

  const output = planExpressionWithExpectedType(
    expression,
    {},
    fakeInput({
      objectShapeFacts: new Map([[resultType, resultShape]]),
    }),
    diagnostics,
    { kind: "IdentifierName", name: "Func" },
    undefined,
    undefined,
    delegateType,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "LambdaExpression");
  assert.equal(printCsharpExpression(output), "async () => new __AsyncResult\n{\n    value = 1,\n}");
});
test("async lambda block returns use finalized Task result object-shape facts", () => {
  const sourceExample = `
    const callback: () => Promise<{ value: int32 }> = async () => {
      return { value: 1 };
    };
  `;
  assert.match(sourceExample, /return \{ value: 1 \}/);
  const resultType = csharpTargetNamedType("__AsyncBlockResult", undefined, { kind: "named", name: "__AsyncBlockResult" });
  const resultShape = objectShape(resultType, [{
    sourceName: "value",
    targetName: "value",
    memberKind: "property",
    type: csharpSourcePrimitiveTargetType("int32"),
  }]);
  const delegateType = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(resultType));
  const expression = asyncArrowFunction(block([
    returnStatement(objectLiteral([
      propertyAssignment(identifier("value"), numericLiteral("1")),
    ])),
  ]));
  const diagnostics = [];

  const output = planExpressionWithExpectedType(
    expression,
    {},
    fakeInput({
      objectShapeFacts: new Map([[resultType, resultShape]]),
    }),
    diagnostics,
    { kind: "IdentifierName", name: "Func" },
    undefined,
    undefined,
    delegateType,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "LambdaExpression");
  assert.equal(printCsharpExpression(output), "async () =>\n{\n    return new __AsyncBlockResult\n    {\n        value = 1,\n    };\n}");
});
test("async lambda object-literal returns fail closed without result object-shape facts", () => {
  const sourceExample = `
    const callback: () => Promise<{ value: int32 }> = async () => ({ value: 1 });
  `;
  assert.match(sourceExample, /async \(\) => \(\{ value: 1 \}\)/);
  const resultType = csharpTargetNamedType("__MissingAsyncResult", undefined, { kind: "named", name: "__MissingAsyncResult" });
  const delegateType = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(resultType));
  const expression = asyncArrowFunction(objectLiteral([
    propertyAssignment(identifier("value"), numericLiteral("1")),
  ]));
  const diagnostics = [];

  const output = planExpressionWithExpectedType(
    expression,
    {},
    fakeInput(),
    diagnostics,
    { kind: "IdentifierName", name: "Func" },
    undefined,
    undefined,
    delegateType,
  );

  assert.equal(output, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal emission requires finalized TSTS\/provider object-shape facts/);
});