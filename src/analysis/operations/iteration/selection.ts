import type { CsharpResolvedIteration } from "../../../target-model/records/selection.js";

import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import type { CsharpOperationSelection } from "../../../target-model/records/operator-selection.js";

import { selectCsharpNativeIteration, rejectCsharpIteration } from "../../../policy/operations/iteration/selection.js";
export function selectCsharpIteration(
  input: CsharpPolicyContext,
  statement: Node,
  expression: Node | undefined,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (expression === undefined) {
    return rejectCsharpIteration("Checked iteration has no iterable expression.");
  }
  const source = input.semantics(sourceFile).operations.iteration(
    statement,
  );
  if (source === undefined) {
    return rejectCsharpIteration(
      "TSTS did not retain an exact checked iteration selection for this statement.",
    );
  }
  const iterableType = input.types.resolveNode(
    expression,
    sourceFile,
  );
  if (iterableType === undefined) {
    return rejectCsharpIteration(
      "The checked iterable expression does not have a closed C# target representation.",
    );
  }
  if (source.iterationKind === "for-await-of") {
    return selectCsharpNativeIteration(source, iterableType, undefined, undefined);
  }
  if (source.iterationKind === "for-of") {
    return selectCsharpNativeIteration(source, iterableType, undefined, undefined);
  }
  const elementType = input.types.resolveType(
    source.sourceElementType,
    sourceFile,
  );
  if (elementType === undefined) {
    return rejectCsharpIteration(
      "The checked property-key type does not have a closed C# target representation.",
    );
  }
  return selectCsharpNativeIteration(source, iterableType, elementType, input.objectShapes.resolveNode(expression, sourceFile));
}
