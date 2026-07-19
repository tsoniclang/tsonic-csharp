import type {
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import {
  asType,
} from "../source-library.js";
import {
  isSourceStandardLibraryDateType,
} from "../../../source-type-classification.js";
import {
  csharpJsDateTargetType,
} from "./target-type.js";

export function mapCsharpJsDateRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsDateRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface Date runtime carrier mapped from checked JavaScript library type." }]);
}

export function getCsharpJsDateRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isDateOrNullishDateUnion(type, context)
    ? csharpJsDateTargetType()
    : undefined;
}

function isDateOrNullishDateUnion(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  if (isSourceStandardLibraryDateType(type, context)) {
    return true;
  }
  const typeShape = context.compiler?.typeShape;
  if (typeShape === undefined || !typeShape.isUnion(type)) {
    return false;
  }
  const nonNullishMembers = typeShape.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined && !typeShape.isNullish(member));
  return nonNullishMembers.length > 0 &&
    nonNullishMembers.every((member) => isSourceStandardLibraryDateType(member, context));
}
