import type { TypeTupleElementInfo } from "@tsonic/tsts";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";

export function selectCsharpSourceParameterVector(
  parameter: CsharpTargetParameter,
  elements: readonly Pick<TypeTupleElementInfo, "elementKind">[] | undefined,
): readonly CsharpTargetParameter[] | undefined {
  if (parameter.paramsArray !== true || parameter.type.kind !== "tuple") return Object.freeze([parameter]);
  if (parameter.passingMode !== "by-value" || elements === undefined ||
    elements.length !== parameter.type.elements.length || elements.some((element, index) =>
      (element.elementKind === "rest" || element.elementKind === "variadic") && index !== elements.length - 1)) return undefined;
  return Object.freeze(parameter.type.elements.map((type, index) => Object.freeze({
    name: `${parameter.name}${index}`, type, passingMode: "by-value" as const,
    ...(elements[index]!.elementKind === "optional" ? { optional: true } : {}),
    ...(elements[index]!.elementKind === "rest" || elements[index]!.elementKind === "variadic" ? { paramsArray: true } : {}),
  })));
}
