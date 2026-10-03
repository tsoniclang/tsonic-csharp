import type { AstReader, Node } from "@tsonic/tsts";
import { sourceSequenceInputChoice, sourceSequenceInputIsEmpty } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/collections.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { combineCsharpTargetUnionMembers } from "../../../target-model/types/runtime-carriers.js";

export function resolveCsharpBorrowedSequenceElement(
  ast: AstReader,
  expression: Node,
  resolve: (node: Node) => TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  const choice = sourceSequenceInputChoice(ast, expression);
  if (choice === undefined) return undefined;
  const elements: TargetTypeRef[] = [];
  for (const input of choice.inputs) {
    if (sourceSequenceInputIsEmpty(ast, input)) continue;
    const carrier = resolve(input);
    const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
    const element = getCsharpCollectionElementTargetType(present);
    if (element === undefined) return undefined;
    elements.push(element);
  }
  return elements.length === 0 ? undefined : combineCsharpTargetUnionMembers(elements);
}
