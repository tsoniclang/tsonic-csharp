import type { Node } from "@tsonic/tsts";
import type { SourceDescriptorView, SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { nativeRepresentationFailure, represented, sourceOutcome } from "../source-type-flow/representation-results.js";

export function selectCsharpSourceParameterEvidenceVector(
  source: SourceDescriptorView,
  evidence: SourceTypeEvidence,
  parameter: CsharpTargetParameter,
  site: Node,
): CsharpRepresentationOutcome<readonly { readonly parameter: CsharpTargetParameter; readonly evidence: SourceTypeEvidence }[]> {
  source.assertEvidence(evidence);
  if (parameter.paramsArray !== true || parameter.type.kind !== "tuple") {
    return represented(Object.freeze([Object.freeze({ parameter, evidence })]));
  }
  let tuple = evidence;
  const visited = new Set<SourceTypeEvidence>();
  while (tuple.type.kind === "declared" || tuple.type.kind === "projection" || tuple.type.kind === "intersection") {
    if (visited.has(tuple)) return nativeRepresentationFailure(site, "CSHARP_CALLABLE_PARAMETER_VECTOR_UNSUPPORTED",
      "The original tuple-rest parameter requires its completed Source component definition.");
    visited.add(tuple);
    const definition = sourceOutcome(source.definition(tuple));
    if (definition.kind !== "represented") return definition;
    tuple = definition.value;
  }
  if (tuple.type.kind !== "tuple") return nativeRepresentationFailure(site, "CSHARP_CALLABLE_PARAMETER_VECTOR_UNSUPPORTED",
    "A physical tuple-rest expansion requires the identical original Source tuple component.");
  const vector = selectCsharpSourceParameterVector(parameter, tuple.type.elements.map(element => ({ elementKind: element.kind })));
  if (vector === undefined) return nativeRepresentationFailure(site, "CSHARP_CALLABLE_PARAMETER_VECTOR_UNSUPPORTED",
    "The exact original callable parameter vector has no legal Native storage signature.");
  const result: { readonly parameter: CsharpTargetParameter; readonly evidence: SourceTypeEvidence }[] = [];
  for (const [index, parameter] of vector.entries()) {
    const element = sourceOutcome(source.component(tuple, { kind: "tuple-element", index }));
    if (element.kind !== "represented") return element;
    result.push(Object.freeze({ parameter, evidence: element.value }));
  }
  return represented(Object.freeze(result));
}

export function selectCsharpSourceParameterVector(
  parameter: CsharpTargetParameter,
  elements: readonly { readonly elementKind: "required" | "optional" | "rest" | "variadic" }[] | undefined,
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
