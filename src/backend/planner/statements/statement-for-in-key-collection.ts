import type { CsharpPlanningContext } from "../context.js";
import { AsForInOrOfStatement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpStatement,
} from "../../roslyn/syntax.js";
import {
  sameCsharpType,
} from "../types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  allocateForInNames,
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
import type {
  CsharpResolvedIteration,
} from "../../../policy/operations/index.js";
import type {
  PlannedForInBinding,
} from "./statement-for-in-binding.js";
import {
  getCsharpTypeForForInCollection,
  getForInKeyType,
  planForInKeyCollectionBindingActivation,
} from "./statement-for-in-binding.js";

export function planKeyCollectionForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedForInBinding,
  selectedIteration: Extract<
    CsharpResolvedIteration,
    {
      readonly iterationKind: "for-in";
      readonly lowering: { readonly kind: "key-collection" };
    }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
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
  const collectionType = getCsharpTypeForForInCollection(
    selectedIteration,
    statement.Expression,
    diagnostics,
  );
  if (collectionType === undefined) {
    return [];
  }
  const { collectionName, keysName } = allocateForInNames(state);
  const bindingActivation = planForInKeyCollectionBindingActivation(
    binding,
    keyType,
    keysName,
    input,
    state,
  );
  const itemName = bindingActivation.itemName;
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
        {
          kind: "ForEachStatement",
          itemType: keyType,
          itemName,
          collection: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: collectionName },
            name: selectedIteration.lowering.memberName,
          },
          body: {
            kind: "Block",
            statements: [
              ...bindingActivation.iterationPrelude,
              ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
            ],
          },
        },
      ],
    },
  }];
}
