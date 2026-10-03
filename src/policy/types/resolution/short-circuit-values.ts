import type { AstReader, Node } from "@tsonic/tsts";
import { sourceBooleanShortCircuitBranch } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../target-model/types/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType, isCsharpNeverTargetType } from "../../../target-model/types/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function resolveCsharpShortCircuitResult(
  ast: AstReader,
  operator: "&&" | "||",
  leftNode: Node | undefined,
  left: TargetTypeRef,
  right: TargetTypeRef,
): TargetTypeRef | undefined {
  const boolean = csharpSourcePrimitiveTargetType("bool");
  if (!targetTypeRefEquals(left, boolean) || leftNode === undefined) return undefined;
  const branch = sourceBooleanShortCircuitBranch(ast, leftNode, operator);
  return branch === "left" ? left : branch === "right" ? right
    : isCsharpNeverTargetType(right) ? left : combineCsharpTargetUnionMembers([left, right]);
}
