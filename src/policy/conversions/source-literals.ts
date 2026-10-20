import type { TargetSelection } from "@tsonic/target-api";
import type { SourceLiteralValue } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { selectedCsharpSourceProfileOwner } from "../identities/source-types.js";
import { csharpTargetId } from "../../target-model/identities/source.js";

export interface CsharpSourceLiteralPolicyHost {
  readonly target: TargetSelection;
}

export function resolveCsharpSourceLiteralTargetType(
  host: CsharpSourceLiteralPolicyHost,
  literal: SourceLiteralValue | undefined,
): TargetTypeRef | undefined {
  const value = literal?.number;
  if (value === undefined) {
    return undefined;
  }
  if (
    selectedCsharpSourceProfileOwner(host.target) === csharpTargetId &&
    Number.isInteger(value) &&
    value >= -2147483648 &&
    value <= 2147483647
  ) {
    return csharpSourcePrimitiveTargetType("int32");
  }
  return csharpSourcePrimitiveTargetType("float64");
}
