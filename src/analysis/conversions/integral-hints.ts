import type { Node } from "@tsonic/tsts";
import { sourceAnnotationHint, type SourceAnnotationHintBindings } from "@tsonic/target-api/source";
import { tsonicCoreSourceSemanticsModules } from "@tsonic/source-core";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpIntegralTargetType } from "../../target-model/types/carriers/scalar-types.js";

export function csharpIntegralConversionAnnotationHint(
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  bindings: SourceAnnotationHintBindings,
): string | undefined {
  const sourceValue = getCsharpNullableElementTargetType(source) ?? source;
  const targetValue = getCsharpNullableElementTargetType(target) ?? target;
  if (sourceValue?.kind !== "source-primitive" || sourceValue.name !== "float64" ||
    targetValue === undefined || !isCsharpIntegralTargetType(targetValue)) return undefined;
  const annotationType = targetValue.kind === "source-primitive"
    ? tsonicCoreSourceSemanticsModules().flatMap(module => module.exports).find(declaration =>
      declaration.kind === "source-primitive" && declaration.primitive === targetValue.name)?.exportName : undefined;
  return sourceAnnotationHint(expression, { ...bindings, annotationType }) ?? "Annotate the value with an integral type.";
}
