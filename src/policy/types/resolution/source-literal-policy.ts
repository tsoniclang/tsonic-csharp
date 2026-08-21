import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import {
  csharpNumericLiteralValue,
} from "../../../target-model/syntax/numeric-literals.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../../../target-model/types/scalar-types.js";
import {
  selectedCsharpSourceProfileOwner,
} from "./source-profile.js";
import {
  csharpTargetId,
} from "../../../target-model/identities/source.js";

export interface CsharpSourceLiteralPolicyHost {
  readonly ast: AstReader;
  readonly target: TargetSelection;
}

export function resolveCsharpSourceLiteralTargetType(
  host: CsharpSourceLiteralPolicyHost,
  node: Node,
): TargetTypeRef | undefined {
  const value = csharpNumericLiteralValue(host.ast, node);
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
