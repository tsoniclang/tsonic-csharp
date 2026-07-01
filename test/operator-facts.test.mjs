import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeCarrierFactKey, targetOperationFactKey } from "@tsonic/tsts";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planExpression, planExpressionWithExpectedType } from "../dist/backend/planner/expressions.js";
import {
  createDestructuringPlannerState,
} from "../dist/backend/planner/bindings.js";
import {
  KindArrowFunction,
  KindArrayLiteralExpression,
  KindAwaitExpression,
  KindBigIntLiteral,
  KindConditionalExpression,
  KindIdentifier,
  KindNoSubstitutionTemplateLiteral,
  KindObjectLiteralExpression,
  KindParameter,
  KindPostfixUnaryExpression,
  KindPropertyAccessExpression,
  KindMethodDeclaration,
  KindPrefixUnaryExpression,
  KindRegularExpressionLiteral,
  KindThisKeyword,
  KindTemplateExpression,
  ModifierFlagsAsync,
  ModifierFlagsStatic,
} from "../dist/backend/planner/source-ast.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";
import {
  csharpObjectShapeFactKey,
  csharpRegularExpressionLiteralFactKey,
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpBigIntegerTargetType,
  csharpDelegateTargetType,
  csharpNullableValueTargetType,
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
import {
  targetOperationFactsAreStructurallyIdentical,
} from "../dist/source/csharp-source-semantics/operations.js";

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

function binary(left, right, operatorKind = "KindPlusToken") {
  return {
    Kind: "KindBinaryExpression",
    Left: left,
    Right: right,
    OperatorToken: { Kind: operatorKind },
  };
}

function conditional(condition, whenTrue, whenFalse) {
  return {
    Kind: KindConditionalExpression,
    Condition: condition,
    WhenTrue: whenTrue,
    WhenFalse: whenFalse,
  };
}

function awaitExpression(expression) {
  return {
    Kind: KindAwaitExpression,
    Expression: expression,
  };
}

function asyncArrowFunction(body) {
  return {
    Kind: KindArrowFunction,
    ModifierFlags: ModifierFlagsAsync,
    Parameters: { Nodes: [] },
    Body: body,
  };
}

function asyncArrowFunctionWithParameters(parameters, body) {
  return {
    Kind: KindArrowFunction,
    ModifierFlags: ModifierFlagsAsync,
    Parameters: { Nodes: parameters },
    Body: body,
  };
}

function block(statements) {
  return {
    Kind: "KindBlock",
    Statements: { Nodes: statements },
  };
}

function returnStatement(expression) {
  return {
    Kind: "KindReturnStatement",
    Expression: expression,
  };
}

function objectLiteral(properties) {
  return {
    Kind: KindObjectLiteralExpression,
    Properties: { Nodes: properties },
  };
}

function propertyAssignment(name, initializer) {
  return {
    Kind: "KindPropertyAssignment",
    name,
    Initializer: initializer,
  };
}

function objectShape(targetType, members) {
  return {
    targetType,
    members,
    implements: [],
  };
}

function thisKeyword() {
  return {
    Kind: KindThisKeyword,
  };
}

function node(kind, properties = {}) {
  return {
    Kind: kind,
    ...properties,
  };
}

function parented(child, parent) {
  child.Parent = parent;
  return child;
}

function identifier(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

function numericLiteral(text) {
  return {
    Kind: "KindNumericLiteral",
    Text: text,
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

function fakeOperatorHostWithSubjects(targetTypes) {
  return {
    getTargetTypeRefForSubject: (subject) => targetTypes.get(subject),
    getCsharpTargetBindingByTargetId: () => undefined,
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
        if (key === csharpObjectShapeFactKey) {
          return options.objectShapeFacts?.get(subject);
        }
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
  parent: (node) => node?.Parent,
  name: (node) => node?.name,
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
