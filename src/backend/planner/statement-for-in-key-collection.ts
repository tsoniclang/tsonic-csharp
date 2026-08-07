import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsForInOrOfStatement,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
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
  CsharpResolvedIteration,
} from "../../policy/operations/index.js";
import type {
  PlannedForInBinding,
} from "./statement-for-in-binding.js";
import {
  getCsharpTypeForForInCollection,
  getForInKeyType,
  planForInBindingActivation,
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
  input: CsharpTranslationContext,
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
  const itemName = keysName;
  const keyExpression: CsharpExpression = { kind: "IdentifierName", name: itemName };
  const bindingActivation = planForInBindingActivation(
    binding,
    keyType,
    keyExpression,
    input,
    state,
  );
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
