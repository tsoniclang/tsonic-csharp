import {
  AsBlock,
  AsBreakStatement,
  AsCatchClause,
  AsContinueStatement,
  AsDoStatement,
  AsExpressionStatement,
  AsForInOrOfStatement,
  AsForStatement,
  AsIdentifier,
  AsIfStatement,
  AsLabeledStatement,
  AsReturnStatement,
  AsThrowStatement,
  AsTryStatement,
  AsVariableDeclaration,
  AsVariableDeclarationList,
  AsVariableStatement,
  AsVoidExpression,
  AsWhileStatement,
  KindArrayBindingPattern,
  KindArrayLiteralExpression,
  KindBlock,
  KindBreakStatement,
  KindContinueStatement,
  KindDebuggerStatement,
  KindDoStatement,
  KindEmptyStatement,
  KindExpressionStatement,
  KindForInStatement,
  KindForOfStatement,
  KindForStatement,
  KindIdentifier,
  KindIfStatement,
  KindLabeledStatement,
  KindObjectBindingPattern,
  KindReturnStatement,
  KindSwitchStatement,
  KindThrowStatement,
  KindTryStatement,
  KindVariableDeclarationList,
  KindVariableStatement,
  KindVoidExpression,
  KindWhileStatement,
  HasSourceKind,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpCatchClause,
  CsharpExpression,
  CsharpForInitializer,
  CsharpLocalDeclaration,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import { getCsharpTypeForNode, invalidCsharpType, predefined, sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  allocateControlLabel,
  allocateForInIndex,
  allocateForOfItem,
  allocateForOfLoop,
  createDestructuringPlannerState,
  planBindingPatternFromExpression,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { isErasedAttributeExpressionStatement } from "./attributes.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { planLocalDeclaration, planLocalDeclarationStatements } from "./locals.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import {
  expressionStatement,
  isCsharpExceptionCarrier,
  isVoidCsharpType,
  planDiscardedExpression,
} from "./statement-output.js";
import { planSwitchStatement } from "./switch-statements.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { csharpTargetIterationFactKey } from "../../source/csharp-facts.js";
import type { CsharpObjectShapeFact, CsharpTargetIterationFact } from "../../source/csharp-facts.js";

export function planBlockStatements(
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): readonly CsharpStatement[] {
  if (blockNode === undefined) {
    return [];
  }
  const block = AsBlock(blockNode)!;
  return (block.Statements?.Nodes ?? []).flatMap((statement) =>
    statement === undefined ? [] : planStatements(statement, sourceFile, input, diagnostics, state));
}

export function planStatements(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): readonly CsharpStatement[] {
  switch (SourceKind(input.ast, node)) {
    case KindEmptyStatement:
      return [];
    case KindBlock:
      return [{
        kind: "Block",
        body: {
          kind: "Block",
          statements: planBlockStatements(node, sourceFile, input, diagnostics, state),
        },
      }];
    case KindReturnStatement: {
      const statement = AsReturnStatement(node)!;
      if (
        HasSourceKind(input.ast, statement.Expression, KindVoidExpression) &&
        state.currentReturnType !== undefined &&
        isVoidCsharpType(state.currentReturnType)
      ) {
        const voidExpression = AsVoidExpression(statement.Expression)!;
        return [
          expressionStatement(planDiscardedExpression(planExpression(voidExpression.Expression!, sourceFile, input, diagnostics))),
          { kind: "ReturnStatement" },
        ];
      }
      return [{
        kind: "ReturnStatement",
        ...(statement.Expression !== undefined
          ? {
              expression: state.currentReturnType === undefined
                ? planExpression(statement.Expression, sourceFile, input, diagnostics)
                : planExpressionWithExpectedType(statement.Expression, sourceFile, input, diagnostics, state.currentReturnType, state.currentReturnTypeSubject),
            }
          : {}),
      }];
    }
    case KindBreakStatement: {
      const statement = AsBreakStatement(node)!;
      if (statement.Label !== undefined) {
        const target = findControlLabel(state, Node_Text(statement.Label));
        if (target === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "Labeled break target was not available from TSTS control-flow binding."));
          return [];
        }
        return [{ kind: "GotoStatement", label: target.breakLabel }];
      }
      return [{ kind: "BreakStatement" }];
    }
    case KindContinueStatement: {
      const statement = AsContinueStatement(node)!;
      if (statement.Label !== undefined) {
        const target = findControlLabel(state, Node_Text(statement.Label));
        if (target?.continueLabel === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "Labeled continue target must be an iteration statement."));
          return [];
        }
        return [{ kind: "GotoStatement", label: target.continueLabel }];
      }
      return [{ kind: "ContinueStatement" }];
    }
    case KindThrowStatement: {
      const statement = AsThrowStatement(node)!;
      if (statement.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Throw statement must have an expression."));
        return [];
      }
      const carrier = getRuntimeCarrierForExpression(input, statement.Expression, sourceFile);
      if (!isCsharpExceptionCarrier(carrier)) {
        diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, "Throw statements require finalized TSTS/provider exception-carrier facts before C# emission."));
        return [];
      }
      return [{
        kind: "ThrowStatement",
        expression: planExpression(statement.Expression, sourceFile, input, diagnostics),
      }];
    }
    case KindDebuggerStatement:
      return [expressionStatement({
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: {
            kind: "SimpleMemberAccessExpression",
            receiver: {
              kind: "SimpleMemberAccessExpression",
              receiver: { kind: "IdentifierName", name: "System" },
              name: "Diagnostics",
            },
            name: "Debugger",
          },
          name: "Break",
        },
        arguments: [],
      })];
    case KindLabeledStatement: {
      const statement = AsLabeledStatement(node)!;
      return [planLabeledStatement(statement, sourceFile, input, diagnostics, state)];
    }
    case KindSwitchStatement:
      return [planSwitchStatement(node, sourceFile, input, diagnostics, state, {
        planExpression,
        planStatements,
      })];
    case KindTryStatement:
      return [planTryStatement(node, sourceFile, input, diagnostics, state)];
    case KindExpressionStatement:
      if (isErasedAttributeExpressionStatement(node, input)) {
        return [];
      }
      if (HasSourceKind(input.ast, AsExpressionStatement(node)!.Expression, KindVoidExpression)) {
        const voidExpression = AsVoidExpression(AsExpressionStatement(node)!.Expression!)!;
        return [expressionStatement(planDiscardedExpression(planExpression(voidExpression.Expression!, sourceFile, input, diagnostics)))];
      }
      return [expressionStatement(planDiscardedExpression(planExpression(AsExpressionStatement(node)!.Expression!, sourceFile, input, diagnostics)))];
    case KindIfStatement: {
      const statement = AsIfStatement(node)!;
      return [{
        kind: "IfStatement",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        thenBody: {
          kind: "Block",
          statements: planNestedStatementBody(statement.ThenStatement, sourceFile, input, diagnostics, state),
        },
        ...(statement.ElseStatement !== undefined
          ? { elseBody: { kind: "Block", statements: planNestedStatementBody(statement.ElseStatement, sourceFile, input, diagnostics, state) } }
          : {}),
      }];
    }
    case KindWhileStatement: {
      const statement = AsWhileStatement(node)!;
      return [{
        kind: "WhileStatement",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        body: {
          kind: "Block",
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
      }];
    }
    case KindDoStatement: {
      const statement = AsDoStatement(node)!;
      return [{
        kind: "DoStatement",
        body: {
          kind: "Block",
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
      }];
    }
    case KindForStatement: {
      const statement = AsForStatement(node)!;
      const initializer = statement.Initializer === undefined
        ? undefined
        : planForInitializer(statement.Initializer, sourceFile, input, diagnostics, state);
      const plannedFor: CsharpStatement = {
        kind: "ForStatement",
        ...(initializer?.initializer !== undefined
          ? { initializer: initializer.initializer }
          : {}),
        ...(statement.Condition !== undefined
          ? { condition: planExpression(statement.Condition, sourceFile, input, diagnostics) }
          : {}),
        ...(statement.Incrementor !== undefined
          ? { incrementor: planExpression(statement.Incrementor, sourceFile, input, diagnostics) }
          : {}),
        body: {
          kind: "Block",
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
      };
      const initializerPrelude = initializer?.prelude ?? [];
      return initializerPrelude.length === 0
          ? [plannedFor]
        : [{
            kind: "Block",
            body: { kind: "Block", statements: [...initializerPrelude, plannedFor] },
          }];
    }
    case KindForInStatement:
      return planForInStatement(node, AsForInOrOfStatement(node)!, sourceFile, input, diagnostics, state);
    case KindForOfStatement: {
      const statement = AsForInOrOfStatement(node)!;
      if (statement.AwaitModifier !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "For-await-of requires async iteration semantics and is not implemented yet."));
      }
      return planForOfStatement(node, statement, sourceFile, input, diagnostics, state);
    }
    case KindVariableStatement: {
      const declarationList = AsVariableStatement(node)!.DeclarationList;
      const declarations = AsVariableDeclarationList(declarationList)!.Declarations?.Nodes ?? [];
      if (declarations.length === 0) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Variable statement has no declaration."));
        return [];
      }
      return declarations
        .filter((declaration): declaration is Node => declaration !== undefined)
        .flatMap((declaration) => planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state));
    }
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Statement is outside the current C# planning surface."));
      return [];
  }
}

function planForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
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
    return planObjectShapeForInStatement(statementNode, statement, binding, selectedIteration, sourceFile, input, diagnostics, state);
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

function planObjectShapeForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedForInBinding,
  selectedIteration: CsharpTargetIterationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
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

function planForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
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
    return planStringCodePointForOfStatement(statementNode, statement, binding, sourceFile, input, diagnostics, state);
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

function planSingleStatement(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpStatement {
  const statements = planNestedStatementBody(node, sourceFile, input, diagnostics, state);
  if (statements.length === 1) {
    return statements[0]!;
  }
  return {
    kind: "Block",
    body: { kind: "Block", statements },
  };
}

function planLabeledStatement(
  statement: NonNullable<ReturnType<typeof AsLabeledStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpStatement {
  const sourceName = sanitizeIdentifier(Node_Text(statement.Label!));
  const target = {
    sourceName,
    breakLabel: allocateControlLabel(state, sourceName, "BreakStatement"),
    ...(isIterationStatement(statement.Statement, input)
      ? { continueLabel: allocateControlLabel(state, sourceName, "ContinueStatement") }
      : {}),
  };
  state.controlLabels.push(target);
  const planned = planSingleStatement(statement.Statement, sourceFile, input, diagnostics, state);
  state.controlLabels.pop();
  const loweredStatement = target.continueLabel === undefined
    ? planned
    : attachContinueLabel(planned, target.continueLabel);
  return {
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LabeledStatement",
          name: sourceName,
          statement: loweredStatement,
        },
        controlLabelStatement(target.breakLabel),
      ],
    },
  };
}

function findControlLabel(
  state: DestructuringPlannerState,
  sourceName: string,
): { readonly breakLabel: string; readonly continueLabel?: string } | undefined {
  const sanitized = sanitizeIdentifier(sourceName);
  for (let index = state.controlLabels.length - 1; index >= 0; index--) {
    const target = state.controlLabels[index]!;
    if (target.sourceName === sanitized) {
      return target;
    }
  }
  return undefined;
}

function isIterationStatement(node: Node | undefined, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, node, KindWhileStatement) ||
    HasSourceKind(input.ast, node, KindDoStatement) ||
    HasSourceKind(input.ast, node, KindForStatement) ||
    HasSourceKind(input.ast, node, KindForInStatement) ||
    HasSourceKind(input.ast, node, KindForOfStatement);
}

function attachContinueLabel(statement: CsharpStatement, label: string): CsharpStatement {
  switch (statement.kind) {
    case "WhileStatement":
    case "DoStatement":
    case "ForStatement":
    case "ForEachStatement":
      return {
        ...statement,
        body: {
          kind: "Block",
          statements: [
            ...statement.body.statements,
            controlLabelStatement(label),
          ],
        },
      };
    case "Block": {
      const lastIndex = statement.body.statements.length - 1;
      const last = statement.body.statements[lastIndex];
      if (last !== undefined) {
        return {
          kind: "Block",
          body: {
            kind: "Block",
            statements: statement.body.statements.map((child, index) =>
              index === lastIndex ? attachContinueLabel(child, label) : child),
          },
        };
      }
      return statement;
    }
    default:
      return statement;
  }
}

function controlLabelStatement(label: string): CsharpStatement {
  return {
    kind: "LabeledStatement",
    name: label,
    statement: {
      kind: "Block",
      body: { kind: "Block", statements: [] },
    },
  };
}

function planTryStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpStatement {
  const statement = AsTryStatement(node)!;
  return {
    kind: "TryStatement",
    tryBody: {
      kind: "Block",
      statements: planBlockStatements(statement.TryBlock, sourceFile, input, diagnostics, state),
    },
    ...(statement.CatchClause !== undefined
      ? { catchClause: planCatchClause(statement.CatchClause, sourceFile, input, diagnostics, state) }
      : {}),
    ...(statement.FinallyBlock !== undefined
      ? { finallyBody: { kind: "Block", statements: planBlockStatements(statement.FinallyBlock, sourceFile, input, diagnostics, state) } }
      : {}),
  };
}

function planCatchClause(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpCatchClause {
  const clause = AsCatchClause(node)!;
  if (clause.VariableDeclaration !== undefined) {
    const variable = AsVariableDeclaration(clause.VariableDeclaration)!;
    const variableName = variable.name;
    if (variableName !== undefined && (HasSourceKind(input.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.ast, variableName, KindArrayBindingPattern))) {
      diagnostics.push(unsupportedNodeDiagnostic(variableName, "Catch destructuring requires a closed thrown-value carrier; unknown catch values cannot trickle into C#."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    const carrier = getRuntimeCarrierForExpression(input, variable.name ?? clause.VariableDeclaration, sourceFile) ??
      getRuntimeCarrierForExpression(input, clause.VariableDeclaration, sourceFile);
    const variableType = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
    if (!isCsharpExceptionCarrier(carrier) || variableType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? clause.VariableDeclaration, "Catch variables require finalized TSTS/provider exception-carrier facts before C# emission."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    return {
      kind: "CatchClause",
      variableType,
      variableName: variable.name === undefined ? undefined : sanitizeIdentifier(Node_Text(variable.name)),
      body: {
        kind: "Block",
        statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
      },
    };
  }
  return {
    kind: "CatchClause",
    body: {
      kind: "Block",
      statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
    },
  };
}

interface PlannedForInitializer {
  readonly initializer?: CsharpForInitializer;
  readonly prelude: readonly CsharpStatement[];
}

function planForInitializer(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForInitializer {
  if (HasSourceKind(input.ast, node, KindVariableDeclarationList)) {
    const declarations = AsVariableDeclarationList(node)!.Declarations?.Nodes ?? [];
    const concreteDeclarations = declarations.filter((declaration): declaration is Node => declaration !== undefined);
    if (concreteDeclarations.some((declaration) => {
      const variable = AsVariableDeclaration(declaration)!;
      return HasSourceKind(input.ast, variable.name, KindObjectBindingPattern) || HasSourceKind(input.ast, variable.name, KindArrayBindingPattern);
    })) {
      return {
        prelude: concreteDeclarations.flatMap((declaration) =>
          planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state)),
      };
    }
    const locals = declarations
      .filter((declaration): declaration is Node => declaration !== undefined)
      .map((declaration) => planLocalDeclaration(declaration, sourceFile, input, diagnostics));
    const first = locals[0];
    if (first !== undefined && locals.some((local) => !sameCsharpType(local.type, first.type))) {
      return {
        prelude: locals.map((local) => ({
          kind: "LocalDeclarationStatement",
          name: local.name,
          type: local.type,
          ...(local.initializer === undefined ? {} : { initializer: local.initializer }),
        })),
      };
    }
    return {
      initializer: {
        kind: "VariableDeclaration",
        locals,
      },
      prelude: [],
    };
  }
  return {
    initializer: {
      kind: "Expression",
      expression: planExpression(node, sourceFile, input, diagnostics),
    },
    prelude: [],
  };
}

function planNestedStatementBody(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (node === undefined) {
    return [];
  }
  if (HasSourceKind(input.ast, node, KindBlock)) {
    return planBlockStatements(node, sourceFile, input, diagnostics, state);
  }
  return planStatements(node, sourceFile, input, diagnostics, state);
}
