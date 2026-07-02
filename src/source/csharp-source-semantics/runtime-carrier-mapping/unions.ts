import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
  csharpObjectShapeFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  csharpRuntimeUnionTargetType,
} from "../target-types.js";
import {
  asType,
  targetTypeRefEquals,
} from "../target-ref-utils.js";
import {
  isTstsNullType,
  isTstsUndefinedType,
} from "../nullish-types.js";

export interface CommonUnionRuntimeCarrier {
  readonly carrier: RuntimeCarrierFactResult["carrier"];
  readonly objectShape?: CsharpObjectShapeFact;
}

export function getRuntimeUnionCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFactResult["carrier"] | undefined {
  const compiler = context.compiler;
  const type = asType(request.type);
  if (compiler === undefined || type === undefined || !compiler.typeShape.isUnion(type)) {
    return undefined;
  }
  const members = compiler.typeShape.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined);
  const nonNullishMembers = members.filter((member) => !compiler.typeShape.isNullish(member));
  if (nonNullishMembers.length < 2) {
    return undefined;
  }
  const memberResults = members.map((member) => getUnionConstituentRuntimeCarrier(member, context, host));
  if (!memberResults.every((member): member is CommonUnionRuntimeCarrier => member !== undefined)) {
    return undefined;
  }
  const memberCarriers = memberResults.map((member) => member.carrier);
  if (containsDuplicateTargetCarrier(memberCarriers)) {
    return undefined;
  }
  return csharpRuntimeUnionTargetType(memberCarriers, memberResults.map((member) => member.objectShape));
}

export function getCommonNonNullishUnionRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): CommonUnionRuntimeCarrier | undefined {
  const compiler = context.compiler;
  const type = asType(request.type);
  if (compiler === undefined || type === undefined || !compiler.typeShape.isUnion(type)) {
    return undefined;
  }
  const members = compiler.typeShape.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined);
  const nonNullishMembers = members.filter((member) => !compiler.typeShape.isNullish(member));
  if (nonNullishMembers.length < 2 || nonNullishMembers.length !== members.length) {
    return undefined;
  }
  const memberCarriers = nonNullishMembers.map((member) => getUnionConstituentRuntimeCarrier(member, context, host));
  if (!memberCarriers.every((member): member is CommonUnionRuntimeCarrier => member !== undefined)) {
    return undefined;
  }
  const first = memberCarriers[0];
  if (first === undefined || !memberCarriers.every((member) => targetTypeRefEquals(first.carrier, member.carrier))) {
    return undefined;
  }
  const objectShape = getCommonUnionObjectShape(memberCarriers.map((member) => member.objectShape));
  return {
    carrier: first.carrier,
    ...(objectShape === undefined ? {} : { objectShape }),
  };
}

function getUnionConstituentRuntimeCarrier(
  type: Type,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): CommonUnionRuntimeCarrier | undefined {
  if (isTstsUndefinedType(type, context.compiler.typeShape)) {
    return { carrier: csharpRuntimeUndefinedTargetType() };
  }
  if (isTstsNullType(type, context.compiler.typeShape)) {
    return { carrier: csharpRuntimeNullTargetType() };
  }
  const runtimeCarrier = context.factResolver.resolve(type, runtimeCarrierFactKey)?.carrier;
  const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(type, context);
  const carrier = runtimeCarrier ??
    objectShape?.targetType ??
    host.getTargetTypeRefForType(type, context, { allowRuntimeCarrier: true });
  if (objectShape !== undefined && carrier !== undefined && targetTypeRefEquals(objectShape.targetType, carrier)) {
    context.facts.set(objectShape.targetType, csharpObjectShapeFactKey, objectShape, [{ message: "C# union constituent object-shape fact attached to finalized target carrier type." }]);
  }
  return carrier === undefined
    ? undefined
    : {
        carrier,
        ...(objectShape !== undefined && targetTypeRefEquals(objectShape.targetType, carrier) ? { objectShape } : {}),
      };
}

function getCommonUnionObjectShape(
  objectShapes: readonly (CsharpObjectShapeFact | undefined)[],
): CsharpObjectShapeFact | undefined {
  const first = objectShapes[0];
  return first !== undefined && objectShapes.every((objectShape) => objectShape !== undefined && objectShapeFactEquals(first, objectShape))
    ? first
    : undefined;
}

function objectShapeFactEquals(left: CsharpObjectShapeFact, right: CsharpObjectShapeFact): boolean {
  return targetTypeRefEquals(left.targetType, right.targetType) &&
    targetTypeRefArrayEquals(left.implements, right.implements) &&
    left.constructible === right.constructible &&
    left.members.length === right.members.length &&
    left.members.every((member, index) => {
      const other = right.members[index];
      return other !== undefined &&
        member.sourceName === other.sourceName &&
        member.targetName === other.targetName &&
        member.memberKind === other.memberKind &&
        member.optional === other.optional &&
        member.readonly === other.readonly &&
        targetTypeRefEquals(member.type, other.type);
    });
}

function targetTypeRefArrayEquals(
  left: readonly RuntimeCarrierFactResult["carrier"][] | undefined,
  right: readonly RuntimeCarrierFactResult["carrier"][] | undefined,
): boolean {
  const leftItems = left ?? [];
  const rightItems = right ?? [];
  return leftItems.length === rightItems.length &&
    leftItems.every((item, index) => {
      const other = rightItems[index];
      return other !== undefined && targetTypeRefEquals(item, other);
    });
}

function containsDuplicateTargetCarrier(carriers: readonly RuntimeCarrierFactResult["carrier"][]): boolean {
  return carriers.some((carrier, index) =>
    carriers.slice(index + 1).some((candidate) => targetTypeRefEquals(carrier, candidate))
  );
}
