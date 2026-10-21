import type { CsharpPlanningContext } from "../context.js";
import { AsForInOrOfStatement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import { predefined } from "../types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CsharpAdmittedIteration } from "../../../target-model/records/selection.js";
import {
  allocateForInNames,
} from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { planExpression } from "../expressions/index.js";
import { consumeCsharpPlannedValue } from "./statement-output.js";
import type {
  NestedStatementPlanner,
} from "./model.js";
import {
  getCsharpTypeForForInCollection,
  planForInBinding,
  planForInBindingActivationForIndex,
} from "./statement-for-in-binding.js";
import {
  planObjectShapeForInStatement,
} from "./statement-for-in-object-shapes.js";
import {
  planKeyCollectionForInStatement,
} from "./statement-for-in-key-collection.js";

export function planForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const diagnosticNode = statement.Expression ?? statement.Initializer ?? statementNode;
  const selectedIteration = input.program.records.iteration.get(statementNode);
  if (selectedIteration === undefined || selectedIteration.iterationKind !== "for-in") {
    failCsharpPlannerInvariant("A planned for-in statement requires its admitted native iteration contract.", diagnosticNode);
  }
  const binding = planForInBinding(
    selectedIteration.binding,
    selectedIteration.elementType,
    input,
    diagnostics,
  );
  if (selectedIteration.lowering.kind === "object-shape-keys") {
    return planObjectShapeForInStatement(statementNode, statement, binding, selectedIteration as Extract<CsharpAdmittedIteration,
      { readonly iterationKind: "for-in"; readonly lowering: { readonly kind: "object-shape-keys" } }>,
    sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (selectedIteration.lowering.kind === "key-collection") {
    return planKeyCollectionForInStatement(statementNode, statement, binding, selectedIteration as Extract<CsharpAdmittedIteration,
      { readonly iterationKind: "for-in"; readonly lowering: { readonly kind: "key-collection" } }>,
    sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (statement.Expression === undefined) {
    failCsharpPlannerInvariant("An admitted for-in statement lost its checked collection expression.", statementNode);
  }
  const collectionType = getCsharpTypeForForInCollection(
    input.scope.typeParameterNames,
    selectedIteration,
    statement.Expression,
  );
  const { indexName, collectionName } = allocateForInNames(state);
  const bindingActivation = planForInBindingActivationForIndex(
    binding,
    indexName,
    selectedIteration.lowering,
    diagnostics,
    input,
    state,
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
        receiver: { kind: "IdentifierName", name: collectionName },
        name: selectedIteration.lowering.lengthMemberName,
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
  if (collection === undefined) failCsharpPlannerInvariant("Admitted property-key iteration requires its collection value plan.", statement.Expression);
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
        plannedLoop,
      ],
    },
  }]);
}
