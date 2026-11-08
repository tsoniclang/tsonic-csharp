import type { SourceLiteralUnit, SourcePresence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionMode, CsharpConversionRelation, CsharpNativeCallableConversionMembers } from "../../target-model/conversions/selection.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";
import { selectCsharpConversion } from "./core.js";
import { csharpScalarLiteralIsRepresentableAs, selectCsharpExactLiteralConversion } from "./literals.js";
import { selectCsharpUnionInjection } from "./union-relations.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function selectCsharpScalarConversion(
  input: Parameters<typeof selectCsharpConversion>[0],
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
  scalar: SourcePresence<SourceLiteralUnit>,
  callable?: CsharpNativeCallableConversionMembers,
): CsharpConversionRelation {
  const selected = selectCsharpConversion(input, source, target, mode, callable);
  if (scalar.kind === "present") {
    const literal = selectCsharpExactLiteralConversion(scalar.value, source, target);
    if (literal.kind === "rejected") return { kind: "rejected", reason: literal.reason };
  }
  if (selected.kind === "implicit" && selected.proof === "runtime-union-arm") {
    const sourceToArm = selectCsharpScalarConversion(input, source, selected.armType, mode, scalar, callable);
    return sourceToArm.kind === "rejected" || sourceToArm.kind === "ambiguous" ? sourceToArm : { ...selected, sourceToArm };
  }
  const nullable = getCsharpNullableElementTargetType(target);
  if (selected.kind === "implicit" && selected.proof === "nullable" && source !== undefined && nullable !== undefined &&
    targetTypeRefEquals(source, nullable)) {
    const payload = selectCsharpScalarConversion(input, source, nullable, mode, scalar, callable);
    if (payload.kind === "rejected" || payload.kind === "ambiguous") return payload;
  }
  if (selected.kind === "identity" && scalar.kind === "present" && target !== undefined &&
    !csharpScalarLiteralIsRepresentableAs(scalar.value, target) &&
    ((getCsharpNullableElementTargetType(target) ?? target).kind === "source-primitive" || isCsharpStringTargetType(target))) {
    return { kind: "rejected", reason: "The original scalar value is outside its selected Native carrier's exact domain." };
  }
  if (selected.kind !== "rejected" || target === undefined || isCsharpRefLikeTargetType(source)) return selected;
  const physicalTarget = getCsharpNullableElementTargetType(target) ?? target;
  if (getCsharpRuntimeUnionArms(physicalTarget) !== undefined) {
    const ranges: string[] = [];
    const injection = selectCsharpUnionInjection(source, physicalTarget, mode,
      arm => {
        if (scalar.kind === "present") {
          const literal = selectCsharpExactLiteralConversion(scalar.value, source, arm);
          if (literal.kind === "rejected") ranges.push(literal.reason);
        }
        return selectCsharpScalarConversion(input, source, arm, mode, scalar, callable);
      });
    if (injection !== undefined) return injection;
    if (ranges.length === 1) return { kind: "rejected", reason: ranges[0]! };
  }
  if (scalar.kind === "none") return selected;
  const literal = scalar.value;
  if (source?.kind === "source-primitive" && source.name === "float64" && physicalTarget.kind === "source-primitive" &&
    literal.kind === "number" && literal.value.kind === "checked-float64" && Number.isFinite(literal.value.value) &&
    (physicalTarget.name === "float32" || physicalTarget.name === "decimal" && Math.abs(literal.value.value) < 2 ** 96)) {
    return { kind: "implicit", proof: "checked-floating-literal" };
  }
  return csharpScalarLiteralIsRepresentableAs(literal, target) ? { kind: "implicit", proof: "literal" } : selected;
}
