import type { CsharpPlanningContext } from "../context.js";
import { AsForInOrOfStatement } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
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
import type {
  NestedStatementPlanner,
} from "./model.js";
import type { CsharpAdmittedIteration } from "../../../target-model/records/selection.js";
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
    CsharpAdmittedIteration,
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
  const keyType = getForInKeyType(input.scope.typeParameterNames, selectedIteration, statementNode);
  if (statement.Expression === undefined) {
    failCsharpPlannerInvariant("An admitted key-collection loop lost its checked collection expression.", statementNode);
  }
  const collectionType = getCsharpTypeForForInCollection(
    input.scope.typeParameterNames,
    selectedIteration,
    statement.Expression,
  );
  const { collectionName, keysName } = allocateForInNames(state);
  const bindingActivation = planForInKeyCollectionBindingActivation(
    binding,
    keysName,
    input,
    state,
    diagnostics,
  );
  const itemName = bindingActivation.itemName;
  const collection = planExpression(statement.Expression, sourceFile, input, diagnostics, state);
  if (collection === undefined) failCsharpPlannerInvariant("Admitted key iteration requires its collection value plan.", statement.Expression);
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
  }]);
}
