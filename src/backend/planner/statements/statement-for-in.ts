import type { CsharpPlanningContext } from "../context.js";
import { AsForInOrOfStatement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpStatement,
} from "../../roslyn/syntax.js";
import { predefined, sameCsharpType } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  allocateForInNames,
} from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { planExpression } from "../expressions/index.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import {
  isCsharpIndexKeyIteration,
  isCsharpKeyCollectionIteration,
  isCsharpObjectShapeKeyIteration,
  selectCsharpIteration,
} from "../../../policy/operations/index.js";
import {
  getCsharpTypeForForInCollection,
  getForInKeyType,
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
  const selectedIteration = selectCsharpIteration(
    input,
    statementNode,
    statement.Expression,
    sourceFile,
  );
  if (selectedIteration.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      diagnosticNode,
      selectedIteration.reason,
    ));
    return [];
  }
  if (selectedIteration.iterationKind !== "for-in") {
    diagnostics.push(unsupportedNodeDiagnostic(
      diagnosticNode,
      "C# for-in emission received a non-for-in checked iteration selection.",
    ));
    return [];
  }
  const binding = planForInBinding(
    statement.Initializer,
    selectedIteration.elementType,
    sourceFile,
    input,
    diagnostics,
  );
  if (binding === undefined) {
    return [];
  }
  if (isCsharpObjectShapeKeyIteration(selectedIteration)) {
    return planObjectShapeForInStatement(statementNode, statement, binding, selectedIteration, sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (isCsharpKeyCollectionIteration(selectedIteration)) {
    return planKeyCollectionForInStatement(statementNode, statement, binding, selectedIteration, sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (!isCsharpIndexKeyIteration(selectedIteration)) {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, "C# for-in emission received an unsupported exact iteration policy."));
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
  const collectionType = getCsharpTypeForForInCollection(
    selectedIteration,
    statement.Expression,
    diagnostics,
  );
  if (collectionType === undefined) {
    return [];
  }
  const { indexName, collectionName } = allocateForInNames(state);
  const bindingActivation = planForInBindingActivationForIndex(
    binding,
    keyType,
    indexName,
    selectedIteration.lowering,
    diagnostics,
    input,
    state,
  );
  if (bindingActivation === undefined) {
    return [];
  }
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
    incrementor: {
      kind: "PostfixUnaryExpression",
      operand: { kind: "IdentifierName", name: indexName },
      operatorToken: { kind: "PlusPlusToken" },
    },
    body: {
      kind: "Block",
      statements: [
        ...bindingActivation.iterationPrelude,
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  };
  return [...bindingActivation.outerPrelude, {
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
