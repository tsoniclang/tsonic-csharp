import { csharpSourcePrimitiveTargetType, getCsharpJsArrayElementTargetType, targetTypeRefEquals } from "../../types/index.js";
import { selectCsharpConversion } from "../../conversions/index.js";
import type { CsharpSelectedTargetCall } from "../selection/selection-types.js";
import type { CsharpSourceProfileCallPolicyContext } from "./source-profile-policy.js";

export function finalizeCsharpRestSequences(
  context: CsharpSourceProfileCallPolicyContext,
  call: CsharpSelectedTargetCall,
): CsharpSelectedTargetCall | undefined {
  if (!call.targetMember.parameters.some(parameter => parameter.paramsArray === true)) return call;
  const sequences: NonNullable<CsharpSelectedTargetCall["sequenceArguments"]>[number][] = [];
  const arguments_ = [...call.arguments];
  const restParameters = call.targetMember.parameters.flatMap((parameter, index) =>
    parameter.paramsArray === true ? [{ parameter, index }] : []);
  for (const [sourceArgumentIndex, argument] of context.source.sourceArguments.entries()) {
    if (!context.host.ast.is.IsSpreadElement(argument.expression)) continue;
    const expression = context.host.ast.as.AsSpreadElement(argument.expression)?.Expression;
    const selections = call.arguments.filter(candidate => candidate.sourceArgumentIndex === sourceArgumentIndex);
    const sourceType = expression === undefined ? undefined : context.host.types.resolveNode(expression, context.sourceFile);
    let first = selections[0];
    if (first === undefined && sourceType?.kind === "tuple" && sourceType.elements.length === 0 &&
      context.source.sourceSelectedSignatureParameters.filter(parameter => parameter.rest).length === 1 &&
      restParameters.length === 1) {
      first = { sourceArgumentIndex, effectiveArgumentIndex: sourceArgumentIndex,
        sourceForm: "spread-sequence", targetParameterIndex: restParameters[0]!.index,
        targetParameter: restParameters[0]!.parameter };
      arguments_.push(first);
    }
    if (first === undefined || selections.some(candidate => candidate.targetParameterIndex !== first.targetParameterIndex)) return undefined;
    const parameter = first.targetParameter;
    const semantics = parameter.csharpSequenceHolePolicy ?? "native";
    if (parameter.paramsArray !== true || parameter.type.kind !== "array" ||
      (semantics === "number-nan" && !targetTypeRefEquals(parameter.type.element, csharpSourcePrimitiveTargetType("float64"))) ||
      expression === undefined) return undefined;
    const elementType = sourceType?.kind === "array" ? sourceType.element : getCsharpJsArrayElementTargetType(sourceType);
    const elementTypes = sourceType?.kind === "tuple" ? sourceType.elements : elementType === undefined ? undefined : [elementType];
    if (sourceType === undefined || elementTypes === undefined) return undefined;
    const elements = elementTypes.map(type => Object.freeze({ type,
      conversion: selectCsharpConversion(context.host, type, parameter.type.kind === "array" ? parameter.type.element : parameter.type, "implicit") }));
    if (elements.some(({ conversion }) => conversion.kind !== "identity" &&
      (conversion.kind !== "implicit" || (semantics === "number-nan"
        ? conversion.proof !== "numeric"
        : !["numeric", "reference", "nullable", "literal"].includes(conversion.proof))))) return undefined;
    const exactBindings = selections.length === 1 && selections[0]?.sourceForm === "spread-sequence" ||
      sourceType.kind === "tuple" && selections.length === sourceType.elements.length &&
      selections.every((selection, index) => selection.sourceForm === "spread-element" && selection.spreadElementIndex === index);
    if (!exactBindings) return undefined;
    sequences.push(Object.freeze({
      sourceArgumentIndex, expression, sourceType, semantics, elements: Object.freeze(elements),
      targetElementType: parameter.type.element, targetParameterIndex: first.targetParameterIndex,
    }));
  }
  arguments_.sort((left, right) => left.sourceArgumentIndex - right.sourceArgumentIndex || left.effectiveArgumentIndex - right.effectiveArgumentIndex);
  return sequences.length === 0 ? call : Object.freeze({ ...call, arguments: Object.freeze(arguments_), sequenceArguments: Object.freeze(sequences) });
}
