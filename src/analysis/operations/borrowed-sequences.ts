import type { CsharpBorrowedSequenceInput } from "../../target-model/records/borrowed-sequences.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceSequenceInputChoice, sourceSequenceInputIsEmpty } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";

import { getCsharpCollectionElementTargetType, getCsharpIndexableLengthMemberName } from "../../target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";

export function classifyCsharpBorrowedSequenceInput(
  policy: CsharpPolicyContext,
  expression: Node,
  sourceFile: SourceFile,
): CsharpBorrowedSequenceInput | undefined {
  const choice = sourceSequenceInputChoice(policy.ast, expression);
  if (choice === undefined) return undefined;
  const spread = policy.ast.parent(expression);
  const array = spread === undefined ? undefined : policy.ast.parent(spread);
  const sourceCarrier = array === undefined ? undefined : policy.types.resolveNode(array, sourceFile);
  if (array === undefined || sourceCarrier === undefined ||
    getCsharpCollectionElementTargetType(sourceCarrier) === undefined) return undefined;
  const inputs: CsharpBorrowedSequenceInput["inputs"][number][] = [];
  for (const node of choice.inputs) {
    if (sourceSequenceInputIsEmpty(policy.ast, node)) {
      inputs.push(Object.freeze({ kind: "empty", expression: node }));
      continue;
    }
    const carrier = policy.types.resolveNode(node, sourceFile);
    if (carrier === undefined) return undefined;
    const optional = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier);
    const presentCarrier = optional ?? carrier;
    const element = getCsharpCollectionElementTargetType(presentCarrier);
    const carriers = presentCarrier.kind === "tuple" ? presentCarrier.elements : element === undefined ? undefined : [element];
    if (carriers === undefined) return undefined;
    inputs.push(Object.freeze({ kind: "sequence", expression: node, carrier, presentCarrier,
      optional: optional !== undefined, lengthMember: getCsharpIndexableLengthMemberName(presentCarrier), elements: Object.freeze([...carriers]) }));
  }
  return Object.freeze({ expression, array, sourceCarrier, controlNodes: choice.controlNodes, inputs: Object.freeze(inputs) });
}
