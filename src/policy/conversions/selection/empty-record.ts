import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";
import { isCsharpEmptyObjectTargetType } from "../../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../types/index.js";
import type { CsharpConversionSelection } from "./model.js";

export function selectCsharpEmptyRecordConversion(
  input: Pick<Partial<CsharpPolicyContext>, "objectShapes">,
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const closed = (type: TargetTypeRef): boolean => {
    if (isCsharpEmptyObjectTargetType(type)) return true;
    if (type.kind !== "target-named" || (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "struct") return false;
    const shape = input.objectShapes?.resolveTarget(type);
    return shape !== undefined && targetTypeRefEquals(type, shape.targetType) &&
      shape.members.length === 0 && (shape.implements?.length ?? 0) === 0;
  };
  return closed(source) && closed(target) ? { kind: "empty-record", source, target } : undefined;
}
