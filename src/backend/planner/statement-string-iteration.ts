import {
  AsForInOrOfStatement,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../roslyn/syntax.js";
import {
  predefined,
  sameCsharpType,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  allocateStringIterationNames,
} from "./bindings.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  planExpression,
} from "./expressions.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import {
  add,
  and,
  assign,
  element,
  lessThan,
  literalNumber,
  member,
} from "./csharp-expression-builders.js";
import {
  csharpStaticMemberExpression,
} from "./csharp-target-operations.js";
import type {
  CsharpTargetIterationFact,
  CsharpTargetMemberOperationFact,
} from "../../source/csharp-facts.js";

export interface PlannedStringForOfBinding extends CsharpLocalDeclaration {
  readonly prelude: readonly CsharpStatement[];
}

export function planStringCodePointForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedStringForOfBinding,
  selectedIteration: CsharpTargetIterationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const stringType = predefined("string");
  if (selectedIteration.iterationKind !== "sync" || selectedIteration.lowering.kind !== "string-code-point") {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, `String code-point for-of received provider lowering '${selectedIteration.lowering.kind}' with kind '${selectedIteration.iterationKind}'.`));
    return [];
  }
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
  const { collectionName, indexName } = allocateStringIterationNames(state);
  const bindingIdentifier = { kind: "IdentifierName", name: binding.name } satisfies CsharpExpression;
  const collectionIdentifier = { kind: "IdentifierName", name: collectionName } satisfies CsharpExpression;
  const indexIdentifier = { kind: "IdentifierName", name: indexName } satisfies CsharpExpression;
  const collectionExpression = planExpression(statement.Expression, sourceFile, input, diagnostics);
  const surrogatePairTest = stringHasSurrogatePairAt(collectionIdentifier, indexIdentifier, selectedIteration, diagnostics, statementNode);
  if (collectionExpression === undefined || surrogatePairTest === undefined) {
    return [];
  }
  return [{
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          name: collectionName,
          type: stringType,
          initializer: collectionExpression,
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
          condition: lessThan(indexIdentifier, member(collectionIdentifier, selectedIteration.lowering.lengthMember)),
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
                condition: surrogatePairTest,
                thenBody: {
                  kind: "Block",
                  statements: [
                    assign(bindingIdentifier, substring(collectionIdentifier, indexIdentifier, selectedIteration.lowering.substringMember, 2)),
                    assign(indexIdentifier, add(indexIdentifier, literalNumber(2))),
                  ],
                },
                elseBody: {
                  kind: "Block",
                  statements: [
                    assign(bindingIdentifier, substring(collectionIdentifier, indexIdentifier, selectedIteration.lowering.substringMember, 1)),
                    {
                      kind: "ExpressionStatement",
                      expression: {
                        kind: "PostfixUnaryExpression",
                        operand: indexIdentifier,
                        operatorToken: { kind: "PlusPlusToken" },
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

function stringHasSurrogatePairAt(
  collection: CsharpExpression,
  index: CsharpExpression,
  selectedIteration: CsharpTargetIterationFact,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
): CsharpExpression | undefined {
  if (selectedIteration.lowering.kind !== "string-code-point") {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "String code-point surrogate test requires finalized string-code-point lowering facts."));
    return undefined;
  }
  const high = callSurrogateOperation(selectedIteration.lowering.highSurrogateOperation, element(collection, index), diagnostics, diagnosticNode);
  const low = callSurrogateOperation(selectedIteration.lowering.lowSurrogateOperation, element(collection, add(index, literalNumber(1))), diagnostics, diagnosticNode);
  if (high === undefined || low === undefined) {
    return undefined;
  }
  return and(
    lessThan(add(index, literalNumber(1)), member(collection, selectedIteration.lowering.lengthMember)),
    and(high, low),
  );
}

function callSurrogateOperation(
  operation: CsharpTargetMemberOperationFact,
  argument: CsharpExpression,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
): CsharpExpression | undefined {
  const callee = csharpStaticMemberExpression(operation, diagnostics, diagnosticNode, "String code-point surrogate test");
  if (callee === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "String code-point surrogate test requires a static C# member operation fact."));
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: [{ kind: "Argument", expression: argument }],
  };
}

function substring(collection: CsharpExpression, start: CsharpExpression, memberName: string, length: number): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: member(collection, memberName),
    arguments: [
      { kind: "Argument", expression: start },
      { kind: "Argument", expression: literalNumber(length) },
    ],
  };
}
