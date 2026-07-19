import { test, assert, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, csharpObjectShapeFactKey, csharpTargetOperationFactKey, beginObjectShapePlanning, beginObjectShapeSourceFilePlanning, csharpTypeFromObjectShapeFact, objectShapeStorageMemberName, takeObjectShapeDeclarations, planObjectLiteralExpressionWithExpectedType, planObjectShapeSpreadAssignments, tryPlanRecordDictionaryLiteralWithExpectedType, printCsharpCompilationUnit, planElementAccessExpression, planPropertyAccessExpression, KindElementAccessExpression, KindFalseKeyword, KindGetAccessor, KindIdentifier, KindMethodDeclaration, KindNumericLiteral, KindObjectLiteralExpression, KindPropertyAccessExpression, KindPropertyAssignment, KindShorthandPropertyAssignment, KindSpreadAssignment, KindStringLiteral, KindTrueKeyword, csharpQualifiedTypeRenderShape, csharpDelegateTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType, identifier, propertyAccess, elementAccess, numericLiteral, binaryExpression, objectLiteral, shorthandPropertyAssignment, spreadAssignment, propertyAssignment, getAccessor, methodDeclaration, parameter, block, stringLiteral, sourceFileNode, attachSourceFile, setParentRecursive, childNodes, span, trueKeyword, falseKeyword, planExpression, planExpectedExpression, fakeInput, targetOperation, csharpMemberOperation, recordDictionaryType, dictionaryTypeNode, fakeAst } from "./object-shape-boundary.helpers.mjs";

test("object-shape property access lowers through finalized shape member facts", () => {
  const sourceFile = {};
  const receiver = identifier("shape");
  const access = propertyAccess(receiver, "count");
  const objectShape = {
    targetType: { kind: "target-named", id: "__Shape" },
    members: [{
      sourceName: "count",
      targetName: "Count",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    sourceFile,
    fakeInput({ objectShapeSubject: receiver, objectShape }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(planned, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "shape" },
    name: "Count",
  });
  assert.deepEqual(diagnostics, []);
});
test("object-shape property access diagnoses missing finalized member evidence", () => {
  const receiver = identifier("shape");
  const access = propertyAccess(receiver, "add");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      objectShapeSubject: receiver,
      objectShape: {
        targetType: { kind: "target-named", id: "__Shape" },
        members: [{
          sourceName: "count",
          targetName: "Count",
          memberKind: "property",
          type: { kind: "source-primitive", name: "int32" },
        }],
      },
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /must match a finalized object-shape member/);
});
test("object-shape property access diagnoses ambiguous finalized member evidence", () => {
  const receiver = identifier("shape");
  const access = propertyAccess(receiver, "count");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      objectShapeSubject: receiver,
      objectShape: {
        targetType: { kind: "target-named", id: "__Shape" },
        members: [
          {
            sourceName: "count",
            targetName: "Count",
            memberKind: "property",
            type: { kind: "source-primitive", name: "int32" },
          },
          {
            sourceName: "count",
            targetName: "DuplicateCount",
            memberKind: "property",
            type: { kind: "source-primitive", name: "int32" },
          },
        ],
      },
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /matched multiple finalized object-shape members/);
});
test("provider-owned property access without selected operation facts fails closed", () => {
  const receiver = identifier("values");
  const access = propertyAccess(receiver, "add");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({ targetBindingSubject: receiver }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /must be selected by TSTS\/provider facts before emission/);
});
test("provider-owned property access emits from finalized selected member fact, not source spelling", () => {
  const receiver = identifier("values");
  const access = propertyAccess(receiver, "sourceSpellingMustNotPickTarget");
  const diagnostics = [];
  const operationId = "Example.Values.Actual";

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      runtimeCarriers: new Map([[
        receiver,
        csharpTargetNamedType("Example.Values", undefined, csharpQualifiedTypeRenderShape("Example", "Values")),
      ]]),
      selectedPropertySubject: access,
      selectedProperty: targetOperation(operationId, "property"),
      csharpOperationSubject: access,
      csharpOperation: csharpMemberOperation(operationId, "property", "Actual"),
    }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "values" },
    name: "Actual",
  });
});
test("provider-owned property access rejects generic selected fact without C# operation fact", () => {
  const receiver = identifier("values");
  const access = propertyAccess(receiver, "actual");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      selectedPropertySubject: access,
      selectedProperty: targetOperation("Example.Values.Actual", "property"),
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized C# target operation fact/);
  assert.match(diagnostics[0].message, /generic TSTS target operation 'Example\.Values\.Actual' is not enough/);
});
test("provider-owned property access rejects C# helper facts without checked target operation facts", () => {
  const receiver = identifier("values");
  const access = propertyAccess(receiver, "sourceSpellingMustNotSelectActual");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      csharpOperationSubject: access,
      csharpOperation: csharpMemberOperation("Example.Values.Actual", "property", "Actual"),
      targetBindingSubject: receiver,
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /must be selected by TSTS\/provider facts before emission/);
});
test("provider-owned element access emits only from finalized selected indexer facts", () => {
  const receiver = identifier("values");
  const access = elementAccess(receiver, numericLiteral("0"));
  const diagnostics = [];
  const operationId = "Example.Values.Item(System.Int32)";

  const planned = planElementAccessExpression(
    access,
    {},
    fakeInput({
      selectedElementSubject: access,
      selectedElement: targetOperation(operationId, "indexer"),
      csharpOperationSubject: access,
      csharpOperation: csharpMemberOperation(operationId, "indexer", "Item"),
    }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "ElementAccessExpression",
    receiver: { kind: "IdentifierName", name: "values" },
    argument: { kind: "LiteralExpression", value: 0 },
  });
});
test("provider-owned element access rejects generic selected indexer without C# operation fact", () => {
  const receiver = identifier("values");
  const access = elementAccess(receiver, numericLiteral("0"));
  const diagnostics = [];

  const planned = planElementAccessExpression(
    access,
    {},
    fakeInput({
      selectedElementSubject: access,
      selectedElement: targetOperation("Example.Values.Item(System.Int32)", "indexer"),
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized C# target operation fact/);
});
test("tuple element access rejects factless backend emission even for literal indexes", () => {
  const receiver = identifier("pair");
  const index = numericLiteral("1");
  const access = elementAccess(receiver, index);
  const diagnostics = [];

  const planned = planElementAccessExpression(
    access,
    {},
    fakeInput({
      runtimeCarriers: new Map([[receiver, {
        kind: "tuple",
        elements: [
          csharpSourcePrimitiveTargetType("int32"),
          csharpStringTargetType(),
        ],
      }]]),
      constantValues: new Map([[index, 1]]),
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized TSTS-selected target element operation/);
});
test("tuple element access consumes finalized selected tuple member operation facts", () => {
  const receiver = identifier("pair");
  const index = identifier("index");
  const access = elementAccess(receiver, index);
  const diagnostics = [];

  const planned = planElementAccessExpression(
    access,
    {},
    fakeInput({
      runtimeCarriers: new Map([[receiver, {
        kind: "tuple",
        elements: [
          csharpSourcePrimitiveTargetType("int32"),
          csharpStringTargetType(),
        ],
      }]]),
      selectedElementSubject: access,
      selectedElement: targetOperation("tsonic.csharp.source.tuple.item.1", "indexer"),
      csharpOperationSubject: access,
      csharpOperation: csharpMemberOperation("tsonic.csharp.source.tuple.item.1", "property", "Item2"),
    }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "pair" },
    name: "Item2",
  });
});
test("tuple element access fails closed instead of reading semantic type strings", () => {
  const receiver = identifier("pair");
  const index = identifier("index");
  const access = elementAccess(receiver, index);
  const diagnostics = [];
  const input = fakeInput({
    runtimeCarriers: new Map([[receiver, {
      kind: "tuple",
      elements: [csharpSourcePrimitiveTargetType("int32")],
    }]]),
  });
  input.analysis.getTypeAtLocation = () => {
    throw new Error("tuple element planning must not inspect semantic type strings");
  };

  const planned = planElementAccessExpression(access, {}, input, diagnostics, planExpression);

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /finalized TSTS-selected target element operation/);
});
test("object-shape method storage names require exact member identity", () => {
  const member = {
    sourceName: "run",
    targetName: "Run",
    memberKind: "method",
    type: { kind: "source-primitive", name: "int32" },
  };
  const shape = {
    targetType: { kind: "target-named", id: "__Shape" },
    members: [member],
  };

  assert.equal(objectShapeStorageMemberName(shape, member), "__tsonic_shape_method_0_Run");
  assert.throws(
    () => objectShapeStorageMemberName(shape, { ...member }),
    /must belong to its object-shape fact/,
  );
});
test("generated structural carriers close over finalized type-parameter target arguments", () => {
  const sourceExample = `
    type Box<T> = { value: T };

    export function create<T>(value: T): Box<T> {
      return { value };
    }
  `;
  assert.match(sourceExample, /Box<T>/);
  assert.match(sourceExample, /return \{ value \}/);

  const typeParameter = { kind: "type-parameter", name: "T" };
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__TsonicShape_Generic",
      typeArguments: [typeParameter],
      csharpRender: { kind: "named", name: "__TsonicShape_Generic" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: typeParameter,
    }],
  };
  const literal = objectLiteral([
    shorthandPropertyAssignment(identifier("value")),
  ]);
  const input = fakeInput({ objectShapes: new Map([[literal, shape]]) });
  const diagnostics = [];

  beginObjectShapePlanning(input);
  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    input,
    diagnostics,
    { kind: "IdentifierName", name: "__TsonicShape_Generic", typeArguments: [{ kind: "IdentifierName", name: "T" }] },
    undefined,
    planExpression,
    planExpectedExpression,
  );
  const declarations = takeObjectShapeDeclarations(input);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: declarations,
  });

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "ObjectCreationExpression",
    type: { kind: "IdentifierName", name: "__TsonicShape_Generic", typeArguments: [{ kind: "IdentifierName", name: "T" }] },
    assignments: [{
      kind: "AssignmentExpression",
      name: "value",
      expression: { kind: "IdentifierName", name: "value" },
    }],
  });
  assert.match(printed, /public class __TsonicShape_Generic<T>/);
  assert.match(printed, /public required T value;/);
});
test("generated structural carriers reuse declarations only when implemented-interface facts match", () => {
  const sourceExample = `
    interface HasValue {
      value: number;
    }

    export function create(value: number): HasValue {
      return { value };
    }
  `;
  assert.match(sourceExample, /interface HasValue/);
  assert.match(sourceExample, /return \{ value \}/);

  const contract = csharpTargetNamedType("Contracts.IHasValue", undefined, csharpQualifiedTypeRenderShape("Contracts", "IHasValue"));
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__TsonicShape_InterfaceBox",
      csharpRender: { kind: "named", name: "__TsonicShape_InterfaceBox" },
    },
    implements: [contract],
    members: [{
      sourceName: "value",
      targetName: "Value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const input = fakeInput();
  const diagnostics = [];

  beginObjectShapePlanning(input);
  const firstType = csharpTypeFromObjectShapeFact(input, shape, diagnostics, identifier("first"));
  const secondType = csharpTypeFromObjectShapeFact(input, shape, diagnostics, identifier("second"));
  const declarations = takeObjectShapeDeclarations(input);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: declarations,
  });

  assert.deepEqual(firstType, { kind: "IdentifierName", name: "__TsonicShape_InterfaceBox" });
  assert.deepEqual(secondType, firstType);
  assert.deepEqual(diagnostics, []);
  assert.equal(declarations.length, 1);
  assert.match(printed, /public class __TsonicShape_InterfaceBox : Contracts\.IHasValue/);
  assert.match(printed, /public required int Value\n\s+\{\n\s+get;\n\s+set;\n\s+\}/);
});
test("generated structural carriers emit once across source files", () => {
  const sourceExample = `
    // a.ts
    export function first(): Shape { return { value: 1 }; }

    // b.ts
    export function second(): Shape { return { value: 2 }; }
  `;
  assert.match(sourceExample, /a\.ts/);
  assert.match(sourceExample, /b\.ts/);

  const shape = {
    targetType: {
      kind: "target-named",
      id: "__TsonicShape_Shared",
      csharpRender: { kind: "named", name: "__TsonicShape_Shared" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const input = fakeInput();
  const diagnostics = [];

  beginObjectShapePlanning(input);
  beginObjectShapeSourceFilePlanning(input, "/src/a.ts");
  const firstType = csharpTypeFromObjectShapeFact(input, shape, diagnostics, identifier("first"));
  const firstDeclarations = takeObjectShapeDeclarations(input, "/src/a.ts");

  beginObjectShapeSourceFilePlanning(input, "/src/b.ts");
  const secondType = csharpTypeFromObjectShapeFact(input, shape, diagnostics, identifier("second"));
  const secondDeclarations = takeObjectShapeDeclarations(input, "/src/b.ts");
  const allDeclarations = takeObjectShapeDeclarations(input);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(firstType, { kind: "IdentifierName", name: "__TsonicShape_Shared" });
  assert.deepEqual(secondType, firstType);
  assert.equal(firstDeclarations.length, 1);
  assert.equal(secondDeclarations.length, 0);
  assert.equal(allDeclarations.length, 1);
});
test("generated structural carriers fail closed when duplicate target identities carry different interfaces", () => {
  const sourceExample = `
    interface ReadableBox {
      value: number;
    }

    interface WritableBox {
      value: number;
    }

    declare const readable: ReadableBox;
    declare const writable: WritableBox;
  `;
  assert.match(sourceExample, /ReadableBox/);
  assert.match(sourceExample, /WritableBox/);

  const readableContract = csharpTargetNamedType("Contracts.IReadableBox", undefined, csharpQualifiedTypeRenderShape("Contracts", "IReadableBox"));
  const writableContract = csharpTargetNamedType("Contracts.IWritableBox", undefined, csharpQualifiedTypeRenderShape("Contracts", "IWritableBox"));
  const baseShape = {
    targetType: {
      kind: "target-named",
      id: "__TsonicShape_CollidingBox",
      csharpRender: { kind: "named", name: "__TsonicShape_CollidingBox" },
    },
    members: [{
      sourceName: "value",
      targetName: "Value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const input = fakeInput();
  const diagnostics = [];

  beginObjectShapePlanning(input);
  csharpTypeFromObjectShapeFact(input, { ...baseShape, implements: [readableContract] }, diagnostics, identifier("readable"));
  csharpTypeFromObjectShapeFact(input, { ...baseShape, implements: [writableContract] }, diagnostics, identifier("writable"));
  const declarations = takeObjectShapeDeclarations(input);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: declarations,
  });

  assert.equal(declarations.length, 1);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object-shape carrier '__TsonicShape_CollidingBox' was requested with incompatible finalized members/);
  assert.match(printed, /Contracts\.IReadableBox/);
  assert.doesNotMatch(printed, /Contracts\.IWritableBox/);
});
test("generated structural carriers fail closed when type-parameter facts are not declared on the carrier", () => {
  const sourceExample = `
    type Box<T> = { value: T };

    export function create<T>(value: T): Box<T> {
      return { value };
    }
  `;
  assert.match(sourceExample, /value: T/);

  const input = fakeInput();
  const diagnostics = [];

  beginObjectShapePlanning(input);
  const renderedType = csharpTypeFromObjectShapeFact(
    input,
    {
      targetType: {
        kind: "target-named",
        id: "__TsonicShape_OpenButUndeclared",
        csharpRender: { kind: "named", name: "__TsonicShape_OpenButUndeclared" },
      },
      members: [{
        sourceName: "value",
        targetName: "value",
        memberKind: "property",
        type: { kind: "type-parameter", name: "T" },
      }],
    },
    diagnostics,
    identifier("shape"),
  );
  const declarations = takeObjectShapeDeclarations(input);

  assert.deepEqual(renderedType, { kind: "IdentifierName", name: "__TsonicShape_OpenButUndeclared" });
  assert.deepEqual(declarations, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /uses type parameter 'T' without declaring it/);
});
test("object-shape object literals fail closed for computed property names", () => {
  const literal = objectLiteral([
    propertyAssignment(binaryExpression(identifier("prefix"), identifier("suffix")), numericLiteral("1")),
  ]);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0].message, /require identifier or string-literal property names/);
  assert.match(diagnostics[1].message, /must match a finalized provider object-shape member/);
});
test("object-shape object literals fail closed for accessors", () => {
  const literal = objectLiteral([
    getAccessor(identifier("value")),
  ]);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal member is outside the current C# planning surface/);
});
test("object-shape object literals fail closed for generic methods", () => {
  const method = methodDeclaration(identifier("map"), {
    typeParameters: [identifier("T")],
    parameters: [parameter(identifier("value"))],
    body: block([]),
  });
  const literal = objectLiteral([method]);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "map",
      targetName: "map",
      memberKind: "method",
      type: csharpDelegateTargetType("System.Func", [{ kind: "source-primitive", name: "int32" }], { kind: "source-primitive", name: "int32" }),
    }],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal generic methods require finalized target delegate facts/);
});
