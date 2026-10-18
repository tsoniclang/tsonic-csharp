import type { CsharpPlanningContext } from "../context.js";
import { AsForInOrOfStatement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import {
  predefined,
} from "../types/index.js";
import {
  failCsharpPlannerInvariant,
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
import type { CsharpAdmittedIteration } from "../../../target-model/records/selection.js";
import type {
  CsharpStaticTargetMethod,
} from "../../../target-model/types/index.js";
import { consumeCsharpPlannedValue } from "./statement-output.js";

export interface PlannedStringForOfBinding extends CsharpLocalDeclaration {
  readonly outerPrelude: readonly CsharpStatement[];
  readonly prelude: readonly CsharpStatement[];
}

export function planStringCodePointForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedStringForOfBinding,
  selectedIteration: Extract<
    CsharpAdmittedIteration,
    { readonly lowering: { readonly kind: "string-code-point" } }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const stringType = predefined("string");
  if (statement.Expression === undefined) {
    return failCsharpPlannerInvariant("An admitted string iteration lost its checked collection expression.", statementNode);
  }
  const { collectionName, indexName } = allocateStringIterationNames(state);
  const bindingIdentifier = { kind: "IdentifierName", name: binding.name } satisfies CsharpExpression;
  const collectionIdentifier = { kind: "IdentifierName", name: collectionName } satisfies CsharpExpression;
  const indexIdentifier = { kind: "IdentifierName", name: indexName } satisfies CsharpExpression;
  const collectionExpression = planExpression(statement.Expression, sourceFile, input, diagnostics);
  const surrogatePairTest = stringHasSurrogatePairAt(input.scope.typeParameterNames, collectionIdentifier, indexIdentifier, selectedIteration, statementNode);
  if (collectionExpression === undefined) {
    return [];
  }
  return consumeCsharpPlannedValue(collectionExpression, value => {
  const loopBlock: CsharpStatement = {
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          name: collectionName,
          type: stringType,
          initializer: value,
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
  });
}

function stringHasSurrogatePairAt(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  collection: CsharpExpression,
  index: CsharpExpression,
  selectedIteration: Extract<
    CsharpAdmittedIteration,
    { readonly lowering: { readonly kind: "string-code-point" } }
  >,
  diagnosticNode: Node,
): CsharpExpression {
  const high = callSurrogateOperation(
    typeParameterNames,
    selectedIteration.lowering.policy.highSurrogateMethod,
    element(collection, index),
    diagnosticNode,
  );
  const low = callSurrogateOperation(
    typeParameterNames,
    selectedIteration.lowering.policy.lowSurrogateMethod,
    element(collection, add(index, literalNumber(1))),
    diagnosticNode,
  );
  return and(
    lessThan(add(index, literalNumber(1)), member(collection, selectedIteration.lowering.policy.lengthMemberName)),
    and(high, low),
  );
}

function callSurrogateOperation(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  operation: CsharpStaticTargetMethod,
  argument: CsharpExpression,
  diagnosticNode: Node,
): CsharpExpression {
  const declaringType = csharpTypeFromTargetTypeRef(operation.declaringType, typeParameterNames);
  if (declaringType === undefined) {
    return failCsharpPlannerInvariant("An admitted string iteration lost its native surrogate method rendering.", diagnosticNode);
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
