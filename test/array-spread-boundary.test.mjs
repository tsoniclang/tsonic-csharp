import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planArrayLiteralExpressionWithCarrier } from "../dist/backend/planner/array-literals/index.js";
import {
  csharpListTargetType,
  csharpQualifiedTypeRenderShape,
  csharpReadOnlyListTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  csharpJsArrayCarrierTargetType,
} from "../dist/source/csharp-source-semantics/surfaces/js/array-target-type.js";
import {
  KindArrayLiteralExpression,
  KindCallExpression,
  KindIdentifier,
  KindNumericLiteral,
  KindOmittedExpression,
  KindSpreadElement,
} from "../dist/backend/planner/source-ast.js";

test("array spread emits from finalized spread carrier facts", () => {
  const sourceExample = `
    declare const tail: number[];
    const value = [1, ...tail, 3];
  `;
  assert.match(sourceExample, /\.\.\.tail/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
    numericLiteral("3"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, int32ArrayType()]]) }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "Concat");
  assert.deepEqual(planned.arguments.map((argument) => argument.expression), [
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 1 }],
    },
    { kind: "IdentifierName", name: "tail" },
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 3 }],
    },
  ]);
});

test("array spread missing facts fail closed before partial C# array creation", () => {
  const sourceExample = `
    declare const tail: unknown;
    const value = [1, ...tail, 3];
  `;
  assert.match(sourceExample, /unknown/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
    numericLiteral("3"),
  ]);
  const sourceText = "const value = [1, ...tail, 3];\n";
  const sourceFile = sourceFileNode("/repo/src/array-spread.ts", sourceText);
  literal.Elements.Nodes[1].Loc = span(sourceText, "...tail");
  attachSourceFile(sourceFile, literal);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    sourceFile,
    fakeInput({
      missingRuntimeCarrierReason: "spread operand carrier was not finalized",
      missingRuntimeCarrierEvidence: [{ message: "TSTS accepted spread syntax, but no target array carrier was recorded" }],
    }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /spread operand carrier was not finalized/);
  assert.ok(diagnostics[0].evidence?.includes("TSTS accepted spread syntax, but no target array carrier was recorded"));
  assert.ok(diagnostics[0].evidence?.includes("source.span=1:19-1:26"));
  assert.deepEqual(diagnostics[0].sourceSpan, {
    fileName: "/repo/src/array-spread.ts",
    line: 1,
    column: 19,
    endLine: 1,
    endColumn: 26,
  });
});

test("array spread rejects finalized carriers with mismatched element facts", () => {
  const sourceExample = `
    declare const tail: string[];
    const value: number[] = [1, ...tail];
  `;
  assert.match(sourceExample, /string\[\]/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, stringArrayType()]]) }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Finalized spread carrier does not match the target array carrier/);
  assert.doesNotMatch(diagnostics[0].message, /carrier fact is missing/);
});

test("array spread emits tuple carrier elements from finalized tuple facts", () => {
  const sourceExample = `
    declare const tail: [number, number];
    const value: number[] = [1, ...tail, 4];
  `;
  assert.match(sourceExample, /\[number, number\]/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
    numericLiteral("4"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, tupleType([int32Type(), int32Type()])]]) }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "Concat");
  assert.deepEqual(planned.arguments.map((argument) => argument.expression), [
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 1 }],
    },
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [
        { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "tail" }, name: "Item1" },
        { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "tail" }, name: "Item2" },
      ],
    },
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 4 }],
    },
  ]);
});

test("array spread rejects tuple carriers with mismatched element facts", () => {
  const sourceExample = `
    declare const tail: [string, number];
    const value: number[] = [...tail];
  `;
  assert.match(sourceExample, /\[string, number\]/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    spreadElement(tail),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, tupleType([csharpStringTargetType(), int32Type()])]]) }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Tuple spread element 0 requires matching finalized tuple and target array element carriers/);
});

test("array spread rejects non-identifier tuple operands until single-evaluation facts exist", () => {
  const sourceExample = `
    declare function makeTail(): [number, number];
    const value: number[] = [...makeTail()];
  `;
  assert.match(sourceExample, /makeTail/);

  const tail = callExpression();
  const literal = arrayLiteral([
    spreadElement(tail),
  ]);
  const sourceText = "const value = [...makeTail()];\n";
  const sourceFile = sourceFileNode("/repo/src/array-spread.ts", sourceText);
  literal.Elements.Nodes[0].Loc = span(sourceText, "...makeTail()");
  attachSourceFile(sourceFile, literal);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    sourceFile,
    fakeInput({ runtimeCarriers: new Map([[tail, tupleType([int32Type(), int32Type()])]]) }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /single-evaluation provider lowering/);
  assert.ok(diagnostics[0].evidence?.includes("source.span=1:16-1:29"));
  assert.deepEqual(diagnostics[0].sourceSpan, {
    fileName: "/repo/src/array-spread.ts",
    line: 1,
    column: 16,
    endLine: 1,
    endColumn: 29,
  });
});

test("JSArray spread rejects finalized non-JSArray carriers without treating them as missing", () => {
  const sourceExample = `
    declare const tail: number[];
    declare const values: JSArray<number>;
    const value = [...tail];
  `;
  assert.match(sourceExample, /JSArray/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    spreadElement(tail),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, int32ArrayType()]]) }),
    diagnostics,
    csharpJsArrayCarrierTargetType(int32Type()),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Finalized spread carrier is not a JSArray carrier/);
  assert.doesNotMatch(diagnostics[0].message, /carrier fact is missing/);
});

test("JSArray sparse literal emits holes only from finalized JSArray carrier facts", () => {
  const sourceExample = `
    const values = [1, , 3];
  `;
  assert.match(sourceExample, /\[1, , 3\]/);

  const literal = arrayLiteral([
    numericLiteral("1"),
    omittedExpression(),
    numericLiteral("3"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput(),
    diagnostics,
    csharpJsArrayCarrierTargetType(int32Type()),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "fromSparse");
  assert.deepEqual(planned.arguments, [
    { kind: "Argument", expression: { kind: "LiteralExpression", value: 3 } },
    { kind: "Argument", expression: { kind: "TupleExpression", elements: [{ kind: "LiteralExpression", value: 0 }, { kind: "LiteralExpression", value: 1 }] } },
    { kind: "Argument", expression: { kind: "TupleExpression", elements: [{ kind: "LiteralExpression", value: 2 }, { kind: "LiteralExpression", value: 3 }] } },
  ]);
});

test("dense array carriers reject sparse literal elisions instead of compacting holes", () => {
  const sourceExample = `
    const values: number[] = [1, , 3];
  `;
  assert.match(sourceExample, /\[1, , 3\]/);

  const literal = arrayLiteral([
    numericLiteral("1"),
    omittedExpression(),
    numericLiteral("3"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput(),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Sparse array literal elisions require closed JSArray hole construction facts/);
});

test("native collection spread emits only from finalized collection element facts", () => {
  const sourceExample = `
    declare const tail: number[];
    const value: List<number> = [1, ...tail, 3];
  `;
  assert.match(sourceExample, /\.\.\.tail/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
    numericLiteral("3"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, int32ArrayType()]]) }),
    diagnostics,
    csharpListTargetType(int32Type()),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "concat");
  assert.deepEqual(planned.arguments.map((argument) => argument.expression), [
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 1 }],
    },
    { kind: "IdentifierName", name: "tail" },
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 3 }],
    },
  ]);
});

test("native collection spread accepts provider enumerable carriers without array-literal metadata", () => {
  const sourceExample = `
    declare const tail: ProviderEnumerable<number>;
    const value: List<number> = [1, ...tail];
  `;
  assert.match(sourceExample, /ProviderEnumerable/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
  ]);
  const diagnostics = [];
  const tailCarrier = providerEnumerableTargetType(int32Type());

  assert.equal(tailCarrier.csharpArrayLiteralElementType, undefined);

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, tailCarrier]]) }),
    diagnostics,
    csharpListTargetType(int32Type()),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "concat");
  assert.deepEqual(planned.arguments.map((argument) => argument.expression), [
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 1 }],
    },
    { kind: "IdentifierName", name: "tail" },
  ]);
});

test("native collection spread accepts tuple carriers from finalized tuple element facts", () => {
  const sourceExample = `
    declare const tail: [number, number];
    const value: List<number> = [1, ...tail];
  `;
  assert.match(sourceExample, /List<number>/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, tupleType([int32Type(), int32Type()])]]) }),
    diagnostics,
    csharpListTargetType(int32Type()),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "concat");
  assert.deepEqual(planned.arguments.map((argument) => argument.expression), [
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 1 }],
    },
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [
        { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "tail" }, name: "Item1" },
        { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "tail" }, name: "Item2" },
      ],
    },
  ]);
});

test("native collection spread rejects provider array-literal-only carriers as missing enumerable evidence", () => {
  const sourceExample = `
    declare const tail: ProviderLiteralOnly<number>;
    const value: List<number> = [...tail];
  `;
  assert.match(sourceExample, /ProviderLiteralOnly/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    spreadElement(tail),
  ]);
  const diagnostics = [];
  const tailCarrier = providerArrayLiteralOnlyTargetType(int32Type());

  assert.equal(tailCarrier.csharpEnumerableElementType, undefined);

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, tailCarrier]]) }),
    diagnostics,
    csharpListTargetType(int32Type()),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Finalized spread carrier element type does not match the target collection element type/);
  assert.doesNotMatch(diagnostics[0].message, /carrier fact is missing/);
});

test("native collection literals use provider construction metadata instead of target id branches", () => {
  const sourceExample = `
    const value: IReadOnlyList<number> = [1, 2];
  `;
  assert.match(sourceExample, /IReadOnlyList/);

  const literal = arrayLiteral([
    numericLiteral("1"),
    numericLiteral("2"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput(),
    diagnostics,
    csharpReadOnlyListTargetType(int32Type()),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "ObjectCreationExpression");
  assert.equal(planned.type.name, "List");
  assert.equal(planned.arguments[0].expression.kind, "ArrayCreationExpression");
});

test("native collection literals reject provider element metadata without construction metadata", () => {
  const sourceExample = `
    const value: ProviderSequence<number> = [1];
  `;
  assert.match(sourceExample, /ProviderSequence/);

  const literal = arrayLiteral([
    numericLiteral("1"),
  ]);
  const diagnostics = [];
  const providerSequence = csharpTargetNamedType(
    "Example.ProviderSequence`1",
    [int32Type()],
    csharpQualifiedTypeRenderShape("Example", "ProviderSequence"),
    { arrayLiteralElementType: int32Type() },
  );

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput(),
    diagnostics,
    providerSequence,
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /array-literal construction type metadata/);
});

function arrayLiteral(elements) {
  return {
    Kind: KindArrayLiteralExpression,
    Elements: { Nodes: elements },
  };
}

function spreadElement(expression) {
  return {
    Kind: KindSpreadElement,
    Expression: expression,
  };
}

function callExpression() {
  return {
    Kind: KindCallExpression,
  };
}

function identifier(text) {
  return {
    Kind: KindIdentifier,
    Text: text,
  };
}

function numericLiteral(text) {
  return {
    Kind: KindNumericLiteral,
    Text: text,
  };
}

function omittedExpression() {
  return {
    Kind: KindOmittedExpression,
  };
}

function sourceFileNode(fileName, text) {
  return {
    Kind: "KindSourceFile",
    Statements: { Nodes: [] },
    FileName: () => fileName,
    Text: () => text,
    Loc: { pos: 0, end: text.length },
  };
}

function attachSourceFile(sourceFile, root) {
  sourceFile.Statements = { Nodes: [root] };
  setParentRecursive(root, sourceFile);
}

function setParentRecursive(subject, parent) {
  if (subject === undefined || subject === null || typeof subject !== "object") {
    return;
  }
  subject.Parent = parent;
  for (const child of childNodes(subject)) {
    setParentRecursive(child, subject);
  }
}

function childNodes(subject) {
  return [
    ...(subject.Elements?.Nodes ?? []),
    subject.Expression,
  ].filter((child) => child !== undefined);
}

function span(text, token) {
  const pos = text.indexOf(token);
  assert.notEqual(pos, -1, `missing token '${token}'`);
  return { pos, end: pos + token.length };
}

const planner = {
  planExpression: planFixtureExpression,
  planExpressionWithExpectedType: planFixtureExpression,
};

function planFixtureExpression(node) {
  switch (node.Kind) {
    case KindIdentifier:
      return { kind: "IdentifierName", name: node.Text };
    case KindNumericLiteral:
      return { kind: "LiteralExpression", value: Number(node.Text) };
    default:
      throw new Error(`Unsupported array spread fixture node ${node.Kind}`);
  }
}

function int32ArrayType() {
  return {
    kind: "array",
    element: int32Type(),
  };
}

function tupleType(elements) {
  return {
    kind: "tuple",
    elements,
  };
}

function stringArrayType() {
  return {
    kind: "array",
    element: csharpStringTargetType(),
  };
}

function providerEnumerableTargetType(elementType) {
  return csharpTargetNamedType(
    "Example.ProviderEnumerable`1",
    [elementType],
    csharpQualifiedTypeRenderShape("Example", "ProviderEnumerable"),
    { enumerableElementType: elementType },
  );
}

function providerArrayLiteralOnlyTargetType(elementType) {
  return csharpTargetNamedType(
    "Example.ProviderLiteralOnly`1",
    [elementType],
    csharpQualifiedTypeRenderShape("Example", "ProviderLiteralOnly"),
    { arrayLiteralElementType: elementType, arrayLiteralConstructionType: csharpListTargetType(elementType) },
  );
}

function int32Type() {
  return { kind: "source-primitive", name: "int32" };
}

function fakeInput(options = {}) {
  const runtimeCarriers = options.runtimeCarriers ?? new Map();
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getTargetBindingFact: () => undefined,
      getFact: () => undefined,
      getRuntimeCarrierFact: (subject) => {
        const carrier = runtimeCarriers.get(subject);
        return carrier === undefined ? undefined : { carrier };
      },
      getSourcePrimitiveFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getStructFact: () => undefined,
      getFieldFact: () => undefined,
      getAttributeFact: () => undefined,
      getDefaultValueFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      isProjectSourceShapeForNode: () => false,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => runtimeCarrierResolution(options, runtimeCarriers, subject),
      resolveRuntimeCarrierForNode: (subject) => runtimeCarrierResolution(options, runtimeCarriers, subject),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
  };
}

function runtimeCarrierResolution(options, runtimeCarriers, subject) {
  const carrier = runtimeCarriers.get(subject);
  return carrier === undefined
    ? missingCarrierResolution(options.missingRuntimeCarrierReason, options.missingRuntimeCarrierEvidence)
    : resolvedCarrierResolution(carrier);
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
};
