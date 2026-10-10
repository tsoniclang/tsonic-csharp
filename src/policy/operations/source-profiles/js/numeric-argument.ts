import type { CsharpTargetParameter } from "../../../types/index.js";
import { csharpBigIntegerTargetType, csharpNullableValueTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, getCsharpNullableElementTargetType,
  isCsharpAbsenceTargetType, targetTypeRefEquals } from "../../../../target-model/types/index.js";
import type { CsharpSourceProfileCallPolicyContext } from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import { targetParameter } from "./common.js";
import { csharpSourceHasNumericConstraint } from "../../../constraints/numeric-evidence.js";

export function csharpJsNumericArgument(context: CsharpSourceProfileCallPolicyContext, index = 0): CsharpTargetParameter | undefined {
  const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[index]);
  if (argument === undefined) return undefined;
  const numeric = getCsharpNullableElementTargetType(argument) ?? argument;
  if (numeric.kind === "type-parameter") {
    const selected = context.source.sourceArguments[index];
    return selected !== undefined && csharpSourceHasNumericConstraint(selected.expression, numeric, context.sourceFile, context.host)
      ? targetParameter("value", argument) : undefined;
  }
  if (!(numeric.kind === "source-primitive" && numeric.name !== "bool" && numeric.name !== "char") &&
      !targetTypeRefEquals(numeric, csharpBigIntegerTargetType())) return undefined;
  return targetParameter("value", argument);
}

export function csharpJsParsingParameters(context: CsharpSourceProfileCallPolicyContext): readonly CsharpTargetParameter[] | undefined {
  const radix = context.source.sourceArguments[1];
  const absent = radix === undefined || isCsharpAbsenceTargetType(resolveCsharpSelectedSourceValue(context, radix));
  const parameter = absent ? targetParameter("radix", csharpNullableValueTargetType(csharpSourcePrimitiveTargetType("float64")), { optional: true })
    : csharpJsNumericArgument(context, 1);
  return parameter === undefined ? undefined : [targetParameter("value", csharpStringTargetType()),
    targetParameter("radix", parameter.type, { optional: true })];
}
