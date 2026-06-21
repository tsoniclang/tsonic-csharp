import {
  AsForInOrOfStatement,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpStatement,
} from "../roslyn/syntax.js";
import { predefined, sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  allocateForInIndex,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { planExpression } from "./expressions.js";
import { CsharpTargetIterationOperation, csharpTargetIterationFactKey } from "../../source/csharp-facts.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import {
  getCsharpTypeForForInCollection,
  getForInKeyType,
  planForInBinding,
  planForInKeyBindingStatement,
} from "./statement-for-in-binding.js";
import {
  planObjectShapeForInStatement,
} from "./statement-for-in-object-shapes.js";

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
  if (selectedIteration.iterationKind === "property-key" && selectedIteration.targetOperation === CsharpTargetIterationOperation.jsObjectShapeKeys) {
    return planObjectShapeForInStatement(statementNode, statement, binding, selectedIteration, sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (selectedIteration.iterationKind !== "property-key" || selectedIteration.targetOperation !== CsharpTargetIterationOperation.jsIndexKeys) {
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
