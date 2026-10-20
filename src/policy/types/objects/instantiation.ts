import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeFactTargetTypeParameters } from "../resolution/substitution.js";

export function instantiateCsharpObjectShape(
  template: CsharpObjectShapeFact,
  target: TargetTypeRef,
): CsharpObjectShapeFact | undefined {
  if (template.targetType.kind !== "target-named" || target.kind !== "target-named") return undefined;
  const parameters = new Set((template.targetType.typeArguments ?? []).flatMap(argument =>
    argument.kind === "type-parameter" ? [argument.identity] : []));
  const bindings = inferCsharpTargetTypeParameterBindings(template.targetType, target, parameters);
  const selected = bindings === undefined ? undefined : substituteObjectShapeFactTargetTypeParameters(template, bindings);
  return selected !== undefined && targetTypeRefEquals(selected.targetType, target) ? selected : undefined;
}
