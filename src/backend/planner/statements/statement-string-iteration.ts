import type { CsharpPlanningContext } from "../context.js";
import { AsForInOrOfStatement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import {
  predefined,
  sameCsharpType,
} from "../types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  allocateStringIterationNames,
} from "../bindings/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  planExpression,
} from "../expressions/index.js";
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
} from "../expressions/csharp-expression-builders.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  CsharpForAwaitOfIteration,
  CsharpForOfIteration,
} from "../../../policy/operations/index.js";
import type {
  CsharpStaticTargetMethod,
} from "../../../policy/types/index.js";

export interface PlannedStringForOfBinding extends CsharpLocalDeclaration {
  readonly outerPrelude: readonly CsharpStatement[];
  readonly prelude: readonly CsharpStatement[];
}

export function planStringCodePointForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedStringForOfBinding,
  selectedIteration: Extract<
    CsharpForOfIteration | CsharpForAwaitOfIteration,
    { readonly lowering: { readonly kind: "string-code-point" } }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const stringType = predefined("string");
  if (selectedIteration.lowering.kind !== "string-code-point") {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, `String code-point for-of received iteration lowering '${selectedIteration.lowering.kind}'.`));
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
  const loopBlock: CsharpStatement = {
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
          condition: lessThan(indexIdentifier, member(collectionIdentifier, selectedIteration.lowering.policy.lengthMemberName)),
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
                    assign(bindingIdentifier, substring(collectionIdentifier, indexIdentifier, selectedIteration.lowering.policy.substringMemberName, 2)),
                    assign(indexIdentifier, add(indexIdentifier, literalNumber(2))),
                  ],
                },
                elseBody: {
                  kind: "Block",
                  statements: [
                    assign(bindingIdentifier, substring(collectionIdentifier, indexIdentifier, selectedIteration.lowering.policy.substringMemberName, 1)),
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
  };
  return [...binding.outerPrelude, loopBlock];
}

function stringHasSurrogatePairAt(
  collection: CsharpExpression,
  index: CsharpExpression,
  selectedIteration: Extract<
    CsharpForOfIteration | CsharpForAwaitOfIteration,
    { readonly lowering: { readonly kind: "string-code-point" } }
  >,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
): CsharpExpression | undefined {
  if (selectedIteration.lowering.kind !== "string-code-point") {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "String code-point surrogate test requires an exact string-code-point lowering policy."));
    return undefined;
  }
  const high = callSurrogateOperation(
    selectedIteration.lowering.policy.highSurrogateMethod,
    element(collection, index),
    diagnostics,
    diagnosticNode,
  );
  const low = callSurrogateOperation(
    selectedIteration.lowering.policy.lowSurrogateMethod,
    element(collection, add(index, literalNumber(1))),
    diagnostics,
    diagnosticNode,
  );
  if (high === undefined || low === undefined) {
    return undefined;
  }
  return and(
    lessThan(add(index, literalNumber(1)), member(collection, selectedIteration.lowering.policy.lengthMemberName)),
    and(high, low),
  );
}

function callSurrogateOperation(
  operation: CsharpStaticTargetMethod,
  argument: CsharpExpression,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
): CsharpExpression | undefined {
  const declaringType = csharpTypeFromTargetTypeRef(operation.declaringType);
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "String code-point surrogate test requires a renderable static target method policy."));
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: declaringType,
      name: operation.memberName,
    },
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
