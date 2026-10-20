import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpJsArrayTargetType } from "../../../target-model/types/carriers/js.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";

import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function selectCsharpParameterListCarrier(
  elements: readonly TargetTypeRef[],
  restIndexes: readonly number[],
  jsEnabled: boolean,
): TargetTypeRef | undefined {
  if (restIndexes.length === 0) {
    return {
      kind: "tuple",
      elements: elements as readonly TargetTypeRef[],
    };
  }
  if (restIndexes.length !== 1) {
    return undefined;
  }
  const restIndex = restIndexes[0]!;
  const restElement = getCsharpCollectionElementTargetType(
    elements[restIndex],
  );
  if (restElement === undefined) {
    return undefined;
  }
  const homogeneous = elements.every((element, index) => {
    const value = index === restIndex
      ? restElement
      : getCsharpNullableElementTargetType(element) ?? element;
    return value !== undefined && targetTypeRefEquals(value, restElement);
  });
  if (!homogeneous) {
    return undefined;
  }
  return jsEnabled
    ? csharpJsArrayTargetType(restElement)
    : { kind: "array", element: restElement };
}
