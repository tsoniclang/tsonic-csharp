import type { CsharpPlanningContext } from "../context.js";
import { AsForInOrOfStatement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import {
  predefined,
} from "../types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import {
  allocateForInNames,
} from "../bindings/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  planExpression,
} from "../expressions/index.js";
import { consumeCsharpPlannedValue } from "./statement-output.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpAdmittedIteration } from "../../../target-model/records/operations/selection.js";
import type {
  NestedStatementPlanner,
} from "./model.js";
import type {
  PlannedForInBinding,
} from "./statement-for-in-binding.js";
import {
  planForInBindingActivation,
} from "./statement-for-in-binding.js";
import { csharpEnumerableKeysType } from "../objects/enumerable-keys.js";
import { csharpEnumerableKeysMethodName } from "../../../target-model/names/object-members.js";

export function planObjectShapeForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedForInBinding,
  selectedIteration: Extract<
    CsharpAdmittedIteration,
    {
      readonly iterationKind: "for-in";
      readonly lowering: { readonly kind: "object-shape-keys" };
    }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  if (statement.Expression === undefined) {
    failCsharpPlannerInvariant("An admitted structural-key loop lost its checked collection expression.", statementNode);
  }
  const objectShape = selectedIteration.lowering.objectShape;
  const collectionType = csharpTypeFromTargetTypeRef(objectShape.targetType, input.scope.typeParameterNames);
  if (collectionType === undefined) {
    failCsharpPlannerInvariant("An admitted structural-key loop lost its native object-shape rendering.", statement.Expression);
  }
  const { indexName, collectionName, keysName } = allocateForInNames(state);
  const keyExpression: CsharpExpression = {
    kind: "ElementAccessExpression",
    receiver: { kind: "IdentifierName", name: keysName },
    arguments: [{ kind: "IdentifierName", name: indexName }],
  };
  const bindingActivation = planForInBindingActivation(
    binding,
    keyExpression,
    input,
    state,
    diagnostics,
  );
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
      operatorToken: { kind: "LessThanToken" },
      right: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: keysName },
        name: "Length",
      },
    },
    incrementors: [{
      kind: "PostfixUnaryExpression",
      operand: { kind: "IdentifierName", name: indexName },
      operatorToken: { kind: "PlusPlusToken" },
    }],
    body: {
      kind: "Block",
      statements: [
        ...bindingActivation.iterationPrelude,
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  };
  const collection = planExpression(statement.Expression, sourceFile, input, diagnostics, state);
  if (collection === undefined) failCsharpPlannerInvariant("Admitted structural-key iteration requires its collection value plan.", statement.Expression);
  return consumeCsharpPlannedValue(collection, value => [...bindingActivation.outerPrelude, {
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          name: collectionName,
          type: collectionType,
          initializer: value,
        },
        {
          kind: "LocalDeclarationStatement",
          name: keysName,
          type: csharpEnumerableKeysType,
          initializer: {
            kind: "InvocationExpression",
            callee: { kind: "SimpleMemberAccessExpression",
              receiver: { kind: "IdentifierName", name: collectionName }, name: csharpEnumerableKeysMethodName },
            arguments: [],
          },
        },
        plannedLoop,
      ],
    },
  }]);
}
