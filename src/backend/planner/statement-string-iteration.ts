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
  allocateForOfLoop,
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
  callStatic,
  element,
  lessThan,
  literalNumber,
  member,
} from "./csharp-expression-builders.js";

export interface PlannedStringForOfBinding extends CsharpLocalDeclaration {
  readonly prelude: readonly CsharpStatement[];
}

export function planStringCodePointForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedStringForOfBinding,
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
                    assign(indexIdentifier, add(indexIdentifier, literalNumber(2))),
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
    lessThan(add(index, literalNumber(1)), member(collection, "Length")),
    and(
      callStatic(predefined("char"), "IsHighSurrogate", [element(collection, index)]),
      callStatic(predefined("char"), "IsLowSurrogate", [element(collection, add(index, literalNumber(1)))]),
    ),
  );
}

function substring(collection: CsharpExpression, start: CsharpExpression, length: number): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: member(collection, "Substring"),
    arguments: [
      { kind: "Argument", expression: start },
      { kind: "Argument", expression: literalNumber(length) },
    ],
  };
}
