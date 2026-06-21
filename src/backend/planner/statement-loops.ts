import {
  AsForInOrOfStatement,
  AsIdentifier,
  AsVariableDeclaration,
  AsVariableDeclarationList,
  HasSourceKind,
  KindArrayBindingPattern,
  KindArrayLiteralExpression,
  KindIdentifier,
  KindObjectBindingPattern,
  KindVariableDeclarationList,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import { getCsharpTypeForNode, invalidCsharpType, predefined, sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  allocateForInIndex,
  allocateForOfItem,
  allocateForOfLoop,
  planBindingPatternFromExpression,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { planLocalDeclaration } from "./locals.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { expressionStatement } from "./statement-output.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { csharpTargetIterationFactKey } from "../../source/csharp-facts.js";
import type { CsharpObjectShapeFact, CsharpTargetIterationFact } from "../../source/csharp-facts.js";

type NestedStatementPlanner = (
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const binding = planForInBinding(statement.Initializer, sourceFile, input, diagnostics);
  if (binding === undefined) {
    return [];
  }
  const selectedIteration = input.facts.getFact(statementNode, csharpTargetIterationFactKey);
  if (selectedIteration === undefined) {
    const diagnosticNode = statement.Expression ?? statement.Initializer ?? statementNode;
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "For-in requires finalized TSTS/provider enumeration facts before C# emission."));
    return [];
  }
  if (selectedIteration.iterationKind === "property-key" && selectedIteration.targetOperation === "object-shape-keys") {
    return planObjectShapeForInStatement(statementNode, statement, binding, selectedIteration, sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (selectedIteration.iterationKind !== "property-key" || selectedIteration.targetOperation !== "array-index-keys") {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, `C# for-in emission does not support target iteration operation '${selectedIteration.targetOperation}' with kind '${selectedIteration.iterationKind}'.`));
    return [];
  }
  const keyType = getForInKeyType(selectedIteration, statementNode, diagnostics);
  if (keyType === undefined) {
    return [];
  }
  if (binding.currentType !== undefined && !sameCsharpType(binding.currentType, keyType)) {
    diagnostics.push(unsupportedNodeDiagnostic(binding.node, "For-in key binding must have the finalized provider key type."));
    return [];
  }
  if (statement.Expression === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_IN_COLLECTION",
      category: "error",
      source: "tsonic-csharp",
      message: "For-in requires a collection expression.",
    });
    return [];
  }
  const collectionType = getCsharpTypeForForInCollection(statement.Expression, sourceFile, input, diagnostics);
  if (collectionType === undefined) {
    return [];
  }
  const indexName = allocateForInIndex(state);
  const collectionName = `__forInTarget${indexName.slice("__forInIndex".length)}`;
  const plannedLoop: CsharpStatement = {
    kind: "ForStatement",
    initializer: {
      kind: "VariableDeclaration",
      locals: [{
        kind: "VariableDeclarator",
        name: indexName,
        type: predefined("int"),
        initializer: { kind: "LiteralExpression", value: 0 },
      }],
    },
    condition: {
      kind: "BinaryExpression",
      left: { kind: "IdentifierName", name: indexName },
      operator: "<",
      right: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: collectionName },
        name: "Length",
      },
    },
    incrementor: {
      kind: "PostfixUnaryExpression",
      operand: { kind: "IdentifierName", name: indexName },
      operator: "++",
    },
    body: {
      kind: "Block",
      statements: [
        planForInKeyBindingStatement(binding, keyType, indexName),
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  };
  return [{
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          name: collectionName,
          type: collectionType,
          initializer: planExpression(statement.Expression, sourceFile, input, diagnostics),
        },
        plannedLoop,
      ],
    },
  }];
}

export function planForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const selectedIteration = input.facts.getFact(statementNode, csharpTargetIterationFactKey);
  if (selectedIteration === undefined) {
    const diagnosticNode = statement.Expression ?? statement.Initializer ?? statementNode;
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-of emission requires finalized TSTS/provider iteration facts."));
    return [];
  }
  const binding = planForOfBinding(statement.Initializer, selectedIteration, sourceFile, input, diagnostics, state);
  if (binding === undefined) {
    return [];
  }
  if (selectedIteration.iterationKind === "sync" && selectedIteration.targetOperation === "string-code-points") {
    return planStringCodePointForOfStatement(statementNode, statement, binding, sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (selectedIteration.iterationKind !== "sync" || selectedIteration.targetOperation !== "ForEachStatement") {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, `C# for-of emission does not support target iteration operation '${selectedIteration.targetOperation}' with kind '${selectedIteration.iterationKind}'.`));
    return [];
  }
  return [{
    kind: "ForEachStatement",
    itemType: binding.type,
    itemName: binding.name,
    collection: planForOfCollectionExpression(statement.Expression, binding.type, sourceFile, input, diagnostics),
    body: {
      kind: "Block",
      statements: [
        ...binding.prelude,
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  }];
}

function planObjectShapeForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedForInBinding,
  selectedIteration: CsharpTargetIterationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const keyType = getForInKeyType(selectedIteration, statementNode, diagnostics);
  if (keyType === undefined) {
    return [];
  }
  if (binding.currentType !== undefined && !sameCsharpType(binding.currentType, keyType)) {
    diagnostics.push(unsupportedNodeDiagnostic(binding.node, "For-in key binding must have the finalized provider key type."));
    return [];
  }
  if (statement.Expression === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_IN_COLLECTION",
      category: "error",
      source: "tsonic-csharp",
      message: "For-in requires a collection expression.",
    });
    return [];
  }
  const objectShape = getObjectShapeForForInExpression(statement.Expression, sourceFile, input);
  if (objectShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, "Object-shape for-in requires finalized object-shape facts on the iterable expression."));
    return [];
  }
  const collectionType = csharpTypeFromTargetTypeRef(objectShape.targetType);
  if (collectionType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, "Object-shape for-in requires a renderable object-shape target type before C# emission."));
    return [];
  }
  const indexName = allocateForInIndex(state);
  const suffix = indexName.slice("__forInIndex".length);
  const collectionName = `__forInTarget${suffix}`;
  const keysName = `__forInKeys${suffix}`;
  const keyExpression: CsharpExpression = {
    kind: "ElementAccessExpression",
    receiver: { kind: "IdentifierName", name: keysName },
    argument: { kind: "IdentifierName", name: indexName },
  };
  const plannedLoop: CsharpStatement = {
    kind: "ForStatement",
    initializer: {
      kind: "VariableDeclaration",
      locals: [{
        kind: "VariableDeclarator",
        name: indexName,
        type: predefined("int"),
        initializer: { kind: "LiteralExpression", value: 0 },
      }],
    },
    condition: {
      kind: "BinaryExpression",
      left: { kind: "IdentifierName", name: indexName },
      operator: "<",
      right: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: keysName },
        name: "Length",
      },
    },
    incrementor: {
      kind: "PostfixUnaryExpression",
      operand: { kind: "IdentifierName", name: indexName },
      operator: "++",
    },
    body: {
      kind: "Block",
      statements: [
        planForInKeyBindingStatementFromExpression(binding, keyType, keyExpression),
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  };
  return [{
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          name: collectionName,
          type: collectionType,
          initializer: planExpression(statement.Expression, sourceFile, input, diagnostics),
        },
        {
          kind: "LocalDeclarationStatement",
          name: keysName,
          type: { kind: "ArrayType", elementType: predefined("string") },
          initializer: {
            kind: "ArrayCreationExpression",
            elementType: predefined("string"),
            elements: objectShape.members.map((member) => ({ kind: "LiteralExpression", value: member.sourceName }) satisfies CsharpExpression),
          },
        },
        plannedLoop,
      ],
    },
  }];
}

function getObjectShapeForForInExpression(
  expression: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForNode(expression, sourceFile, input);
}

function getCsharpTypeForForInCollection(
  expression: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const carrier = getRuntimeCarrierForExpression(input, expression, sourceFile);
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
  if (type !== undefined) {
    return type;
  }
  diagnostics.push(unsupportedNodeDiagnostic(expression, "For-in collection temp requires a finalized runtime carrier fact before C# emission."));
  return undefined;
}

interface PlannedForInBinding {
  readonly kind: "LocalDeclarationStatement" | "assignment";
  readonly name: string;
  readonly node: Node;
  readonly currentType?: ReturnType<typeof getCsharpTypeForNode>;
}

function planForInBinding(
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): PlannedForInBinding | undefined {
  if (initializer === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_IN_BINDING",
      category: "error",
      source: "tsonic-csharp",
      message: "For-in statement has no initializer.",
    });
    return undefined;
  }
  if (HasSourceKind(input.ast, initializer, KindVariableDeclarationList)) {
    const declarations = AsVariableDeclarationList(initializer)!.Declarations?.Nodes ?? [];
    const concreteDeclarations = declarations.filter((declaration): declaration is Node => declaration !== undefined);
    const first = concreteDeclarations[0];
    if (first === undefined || concreteDeclarations.length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-in variable declaration must contain exactly one binding."));
      return undefined;
    }
    const variable = AsVariableDeclaration(first)!;
    if (variable.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(first, "For-in variable declaration cannot have an initializer."));
      return undefined;
    }
    if (variable.name === undefined || !HasSourceKind(input.ast, variable.name, KindIdentifier)) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? first, "For-in C# key binding must be an identifier; binding patterns require finalized object-key destructuring facts."));
      return undefined;
    }
    return {
      kind: "LocalDeclarationStatement",
      name: sanitizeIdentifier(Node_Text(variable.name)),
      node: first,
      currentType: getCsharpTypeForNode(variable.name, sourceFile, input, undefined, diagnostics),
    };
  }
  if (HasSourceKind(input.ast, initializer, KindIdentifier)) {
    const identifier = AsIdentifier(initializer)!;
    return {
      kind: "assignment",
      name: sanitizeIdentifier(Node_Text(identifier)),
      node: initializer,
      currentType: getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-in initializer binding is outside the current C# planning surface."));
  return undefined;
}

function getForInKeyType(
  selectedIteration: CsharpTargetIterationFact,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  const targetKeyType = selectedIteration.elementType === undefined
    ? undefined
    : targetTypeRefFromFactSubject(selectedIteration.elementType);
  const keyType = targetKeyType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetKeyType);
  if (keyType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-in key emission requires a provider iteration fact with a closed target key type."));
    return undefined;
  }
  return keyType;
}

function targetTypeRefFromFactSubject(subject: CsharpTargetIterationFact["elementType"]): TargetTypeRef | undefined {
  if (subject === undefined || typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const kind = (subject as { readonly kind?: unknown }).kind;
  switch (kind) {
    case "source-primitive":
    case "target-named":
    case "type-parameter":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return subject as TargetTypeRef;
    default:
      return undefined;
  }
}

function planForInKeyBindingStatement(
  binding: PlannedForInBinding,
  keyType: ReturnType<typeof getCsharpTypeForNode>,
  indexName: string,
): CsharpStatement {
  return planForInKeyBindingStatementFromExpression(binding, keyType, forInKeyExpression(indexName));
}

function planForInKeyBindingStatementFromExpression(
  binding: PlannedForInBinding,
  keyType: ReturnType<typeof getCsharpTypeForNode>,
  keyExpression: CsharpExpression,
): CsharpStatement {
  if (binding.kind === "LocalDeclarationStatement") {
    return {
      kind: "LocalDeclarationStatement",
      name: binding.name,
      type: keyType,
      initializer: keyExpression,
    };
  }
  return expressionStatement({
    kind: "BinaryExpression",
    left: { kind: "IdentifierName", name: binding.name },
    operator: "=",
    right: keyExpression,
  });
}

function forInKeyExpression(indexName: string): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: indexName },
      name: "ToString",
    },
    arguments: [{
      kind: "Argument",
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: {
          kind: "SimpleMemberAccessExpression",
          receiver: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: "System" },
            name: "Globalization",
          },
          name: "CultureInfo",
        },
        name: "InvariantCulture",
      },
    }],
  };
}

function planForOfCollectionExpression(
  expression: Node | undefined,
  elementType: ReturnType<typeof getCsharpTypeForNode>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  if (expression === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_COLLECTION",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of requires a collection expression.",
    });
    return { kind: "InvalidExpression", reason: "missing for-of collection" };
  }
  if (HasSourceKind(input.ast, expression, KindArrayLiteralExpression)) {
    return planExpressionWithExpectedType(
      expression,
        sourceFile,
        input,
        diagnostics,
        { kind: "ArrayType", elementType },
        undefined,
      );
  }
  return planExpression(expression, sourceFile, input, diagnostics);
}

function planStringCodePointForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedForOfBinding,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const stringType = predefined("string");
  if (!sameCsharpType(binding.type, stringType)) {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, "String for-of binding must have the finalized provider element type string."));
    return [];
  }
  if (statement.Expression === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_COLLECTION",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of requires a collection expression.",
    });
    return [];
  }
  const loopIndex = allocateForOfLoop(state);
  const collectionName = `__forOfString${loopIndex}`;
  const indexName = `__forOfIndex${loopIndex}`;
  const bindingIdentifier = { kind: "IdentifierName", name: binding.name } satisfies CsharpExpression;
  const collectionIdentifier = { kind: "IdentifierName", name: collectionName } satisfies CsharpExpression;
  const indexIdentifier = { kind: "IdentifierName", name: indexName } satisfies CsharpExpression;
  return [{
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          name: collectionName,
          type: stringType,
          initializer: planExpression(statement.Expression, sourceFile, input, diagnostics),
        },
        {
          kind: "ForStatement",
          initializer: {
            kind: "VariableDeclaration",
            locals: [{
              kind: "VariableDeclarator",
              name: indexName,
              type: predefined("int"),
              initializer: { kind: "LiteralExpression", value: 0 },
            }],
          },
          condition: lessThan(indexIdentifier, member(collectionIdentifier, "Length")),
          body: {
            kind: "Block",
            statements: [
              {
                kind: "LocalDeclarationStatement",
                name: binding.name,
                type: stringType,
              },
              {
                kind: "IfStatement",
                condition: stringHasSurrogatePairAt(collectionIdentifier, indexIdentifier),
                thenBody: {
                  kind: "Block",
                  statements: [
                    assign(bindingIdentifier, substring(collectionIdentifier, indexIdentifier, 2)),
                    assign(indexIdentifier, add(indexIdentifier, literal(2))),
                  ],
                },
                elseBody: {
                  kind: "Block",
                  statements: [
                    assign(bindingIdentifier, substring(collectionIdentifier, indexIdentifier, 1)),
                    {
                      kind: "ExpressionStatement",
                      expression: {
                        kind: "PostfixUnaryExpression",
                        operand: indexIdentifier,
                        operator: "++",
                      },
                    },
                  ],
                },
              },
              ...binding.prelude,
              ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
            ],
          },
        },
      ],
    },
  }];
}

function stringHasSurrogatePairAt(collection: CsharpExpression, index: CsharpExpression): CsharpExpression {
  return and(
    lessThan(add(index, literal(1)), member(collection, "Length")),
    and(
      callStatic(predefined("char"), "IsHighSurrogate", [element(collection, index)]),
      callStatic(predefined("char"), "IsLowSurrogate", [element(collection, add(index, literal(1)))]),
    ),
  );
}

function substring(collection: CsharpExpression, start: CsharpExpression, length: number): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: member(collection, "Substring"),
    arguments: [
      { kind: "Argument", expression: start },
      { kind: "Argument", expression: literal(length) },
    ],
  };
}

function callStatic(type: CsharpTypeNode, name: string, args: readonly CsharpExpression[]): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: type,
      name,
    },
    arguments: args.map((expression) => ({ kind: "Argument", expression })),
  };
}

function assign(left: CsharpExpression, right: CsharpExpression): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "BinaryExpression",
      left,
      operator: "=",
      right,
    },
  };
}

function and(left: CsharpExpression, right: CsharpExpression): CsharpExpression {
  return {
    kind: "BinaryExpression",
    left,
    operator: "&&",
    right,
  };
}

function lessThan(left: CsharpExpression, right: CsharpExpression): CsharpExpression {
  return {
    kind: "BinaryExpression",
    left,
    operator: "<",
    right,
  };
}

function add(left: CsharpExpression, right: CsharpExpression): CsharpExpression {
  return {
    kind: "BinaryExpression",
    left,
    operator: "+",
    right,
  };
}

function member(receiver: CsharpExpression, name: string): CsharpExpression {
  return {
    kind: "SimpleMemberAccessExpression",
    receiver,
    name,
  };
}

function element(receiver: CsharpExpression, argument: CsharpExpression): CsharpExpression {
  return {
    kind: "ElementAccessExpression",
    receiver,
    argument,
  };
}

function literal(value: number): CsharpExpression {
  return {
    kind: "LiteralExpression",
    value,
  };
}

interface PlannedForOfBinding extends CsharpLocalDeclaration {
  readonly prelude: readonly CsharpStatement[];
}

function planForOfBinding(
  initializer: Node | undefined,
  selectedIteration: CsharpTargetIterationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForOfBinding | undefined {
  if (initializer === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_BINDING",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of statement has no initializer.",
    });
    return undefined;
  }
  if (HasSourceKind(input.ast, initializer, KindVariableDeclarationList)) {
    const declarations = AsVariableDeclarationList(initializer)!.Declarations?.Nodes ?? [];
    const first = declarations.find((declaration): declaration is Node => declaration !== undefined);
    if (first === undefined || declarations.filter((declaration) => declaration !== undefined).length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of variable declaration must contain exactly one binding."));
      return undefined;
    }
    const variable = AsVariableDeclaration(first)!;
    if (variable.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(first, "For-of variable declaration cannot have an initializer."));
    }
    const variableName = variable.name;
    if (variableName !== undefined && (HasSourceKind(input.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.ast, variableName, KindArrayBindingPattern))) {
      const itemName = allocateForOfItem(state);
      const itemType = variable.Type === undefined
        ? getForOfElementType(selectedIteration, first, diagnostics)
        : getCsharpTypeForNode(variable.Type, sourceFile, input, invalidCsharpType("missing for-of destructuring item type"), diagnostics);
      if (itemType === undefined) {
        return undefined;
      }
      return {
        kind: "VariableDeclarator",
        name: itemName,
        type: itemType,
        prelude: planBindingPatternFromExpression(
          variableName,
          { kind: "IdentifierName", name: itemName },
          first,
          sourceFile,
          input,
          diagnostics,
          state,
        ),
      };
    }
    const planned = planLocalDeclaration(first, sourceFile, input, diagnostics);
    const inferredItemType = variable.Type === undefined
      ? getForOfElementType(selectedIteration, first, diagnostics)
      : undefined;
    if (variable.Type === undefined && inferredItemType === undefined) {
      return undefined;
    }
    return {
      ...planned,
      ...(inferredItemType === undefined ? {} : { type: inferredItemType }),
      prelude: [],
    };
  }
  if (HasSourceKind(input.ast, initializer, KindIdentifier)) {
    const identifier = AsIdentifier(initializer)!;
    return {
      name: sanitizeIdentifier(Node_Text(identifier)),
      kind: "VariableDeclarator",
      type: getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
      prelude: [],
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of initializer binding is outside the current C# planning surface."));
  return undefined;
}

function getForOfElementType(
  selectedIteration: CsharpTargetIterationFact,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const targetElementType = selectedIteration.elementType === undefined
    ? undefined
    : targetTypeRefFromFactSubject(selectedIteration.elementType);
  const elementType = targetElementType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetElementType);
  if (elementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-of destructuring requires a provider iteration fact with a closed target element type."));
    return undefined;
  }
  return elementType;
}
