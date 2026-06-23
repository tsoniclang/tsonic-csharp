import {
  AsForInOrOfStatement,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../roslyn/syntax.js";
import {
  sameCsharpType,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  allocateForInNames,
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
import type {
  CsharpTargetIterationFact,
} from "../../source/csharp-facts.js";
import type {
  PlannedForInBinding,
} from "./statement-for-in-binding.js";
import {
  getCsharpTypeForForInCollection,
  getForInKeyType,
  planForInKeyBindingStatementFromExpression,
} from "./statement-for-in-binding.js";

export function planKeyCollectionForInStatement(
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
  if (selectedIteration.lowering.kind !== "key-collection") {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, `Key-collection for-in received provider lowering '${selectedIteration.lowering.kind}'.`));
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
  if (selectedIteration.lowering.keysMember.kind !== "member" || selectedIteration.lowering.keysMember.operationKind !== "property") {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, "Key-collection for-in requires a finalized provider property member fact for key enumeration."));
    return [];
  }
  if (selectedIteration.lowering.keysMember.selectedMember === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, "Key-collection for-in requires closed selected provider member evidence for key enumeration."));
    return [];
  }
  if (selectedIteration.lowering.keysMember.memberName !== selectedIteration.lowering.keysMember.selectedMember.targetName) {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, "Key-collection for-in received mismatched key-member target-name facts."));
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
  const { collectionName, keysName } = allocateForInNames(state);
  const itemName = binding.kind === "LocalDeclarationStatement" ? binding.name : keysName;
  const keyExpression: CsharpExpression = { kind: "IdentifierName", name: itemName };
  const bindingStatements = binding.kind === "LocalDeclarationStatement"
    ? []
    : [planForInKeyBindingStatementFromExpression(binding, keyType, keyExpression)];
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
          kind: "ForEachStatement",
          itemType: keyType,
          itemName,
          collection: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: collectionName },
            name: selectedIteration.lowering.keysMember.memberName,
          },
          body: {
            kind: "Block",
            statements: [
              ...bindingStatements,
              ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
            ],
          },
        },
      ],
    },
  }];
}
