import type { CsharpTargetParameter } from "../../../types/index.js";
import { csharpBigIntegerTargetType, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../types/index.js";
import type { CsharpSourceProfileCallPolicyContext } from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import { targetParameter } from "./common.js";

export function csharpJsNumericArgument(context: CsharpSourceProfileCallPolicyContext, index = 0): CsharpTargetParameter | undefined {
  const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[index]);
  if (argument === undefined) return undefined;
  const numeric = getCsharpNullableElementTargetType(argument) ?? argument;
  if (!(numeric.kind === "source-primitive" && numeric.name !== "bool" && numeric.name !== "char") &&
      !targetTypeRefEquals(numeric, csharpBigIntegerTargetType())) return undefined;
  return targetParameter("value", argument);
}
