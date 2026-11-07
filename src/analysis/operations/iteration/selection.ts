import type { CsharpResolvedIteration } from "../../../target-model/records/operations/selection.js";

import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import type { CsharpOperationSelection } from "../../../target-model/records/operations/operator-selection.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { sourceIteration } from "../../program/source-facts.js";

import { selectCsharpNativeIteration, rejectCsharpIteration } from "../../../policy/operations/iteration/selection.js";

/** A loop iteration: for-of / for-await-of read the Host iteration protocol; for-in reads its key binding type. */
export function selectCsharpIteration(
  input: CsharpPolicyContext,
  statement: Node,
  expression: Node | undefined,
  iterableType: TargetTypeRef | undefined,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (expression === undefined) {
    return rejectCsharpIteration("Checked iteration has no iterable expression.");
  }
  if (iterableType === undefined) {
    return rejectCsharpIteration(
      "The checked iterable expression does not have a closed C# target representation.",
    );
  }
  if (input.ast.is.IsForOfStatement(statement)) {
    const kind = input.ast.as.AsForInOrOfStatement(statement)?.AwaitModifier === undefined ? "for-of" : "for-await-of";
    if (kind === "for-await-of") {
      // A for-await without one iteration protocol: the Host publishes the per-arm protocols ("mixed") or none
      // ("untyped") and raises no code; C# refuses the loop with its baseline texts (Q94, #47).
      const published = input.facts.selections.iteration(statement);
      if (published !== undefined && "kind" in published && published.kind === "unresolved-protocol") {
        return rejectCsharpIteration(published.reason === "mixed"
          ? "For-await union iteration requires every exact source alternative to select one target iteration policy."
          : "Untyped dynamic for-await iteration has no closed C# target protocol.");
      }
    }
    return selectCsharpNativeIteration({ kind, statement, selection: sourceIteration(input.facts, statement) },
      iterableType, undefined, undefined);
  }
  const initializer = input.ast.as.AsForInOrOfStatement(statement)?.Initializer;
  const declaration = initializer === undefined || !input.ast.is.IsVariableDeclarationList(initializer) ? undefined
    : input.ast.children(initializer).find((child): child is NonNullable<typeof child> =>
      child !== undefined && input.ast.is.IsVariableDeclaration(child));
  const key = declaration !== undefined ? input.types.storage(declaration)
    : initializer !== undefined && !input.ast.is.IsVariableDeclarationList(initializer) ? input.types.value(initializer) : undefined;
  if (key === undefined || key.kind === "csharp-refused") {
    return rejectCsharpIteration(
      "The checked property-key type does not have a closed C# target representation.",
    );
  }
  return selectCsharpNativeIteration({ kind: "for-in", statement }, iterableType, key, input.objectShapes.resolveNode(expression));
}
