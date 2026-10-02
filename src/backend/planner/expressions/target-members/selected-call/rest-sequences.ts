import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { getCsharpIndexableLengthMemberName, targetTypeRefEquals } from "../../../../../target-model/types/index.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpSelectedTargetCall } from "../../../../../analysis/operations/index.js";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpConversionIsApplicable } from "../../../../../policy/conversions/index.js";
import { planCsharpSequenceValue } from "../../sequence-conversions.js";

export function planCsharpRestSequence(
  sequence: NonNullable<CsharpSelectedTargetCall["sequenceArguments"]>[number],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const actual = input.types.classifications.resolveNode(sequence.expression, sourceFile);
  if (actual === undefined || !targetTypeRefEquals(actual, sequence.sourceType) ||
    sequence.elements.length !== (actual.kind === "tuple" ? actual.elements.length : 1)) return undefined;
  const source = planExpression(sequence.expression, sourceFile, input, diagnostics);
  const type = csharpTypeFromTargetTypeRef(actual, input.scope.typeParameterNames);
  const elementType = csharpTypeFromTargetTypeRef(sequence.targetElementType, input.scope.typeParameterNames);
  const elements = sequence.elements.map(element => ({ carrier: element.type,
    type: csharpTypeFromTargetTypeRef(element.type, input.scope.typeParameterNames), conversion: element.conversion }));
  if (source === undefined || type === undefined || elementType === undefined ||
    elements.some(element => element.type === undefined || !csharpConversionIsApplicable(element.conversion, "implicit"))) return undefined;
  if (actual.kind !== "tuple" && sequence.semantics === "native" && elements[0]?.conversion.kind === "identity") {
    return { kind: "CastExpression", type: { kind: "ArrayType", elementType },
      expression: { kind: "CollectionExpression", elements: [{ kind: "SpreadElement", expression: source }] } };
  }
  return planCsharpSequenceValue(sequence.expression, { carrier: actual, type, expression: source,
    lengthMember: getCsharpIndexableLengthMemberName(actual),
    elements: elements.map(element => ({ ...element, type: element.type! })) },
    sourceFile, input, diagnostics, elementType, sequence.targetElementType);
}
