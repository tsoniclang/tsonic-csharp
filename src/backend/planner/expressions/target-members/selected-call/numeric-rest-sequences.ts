import { applyCsharpConversionSelection } from "../../conversions.js";
import { allocateSyntheticParameter, createDestructuringPlannerState } from "../../../bindings/index.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { csharpTupleElementMemberName, targetTypeRefEquals } from "../../../../../target-model/types/index.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpSelectedTargetCall } from "../../../../../analysis/operations/index.js";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function planCsharpNumericRestSequence(
  sequence: NonNullable<CsharpSelectedTargetCall["sequenceArguments"]>[number],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const actual = input.types.classifications.resolveNode(sequence.expression, sourceFile);
  if (actual === undefined || !targetTypeRefEquals(actual, sequence.sourceType)) return undefined;
  const source = planExpression(sequence.expression, sourceFile, input, diagnostics);
  if (source === undefined) return undefined;
  const state = createDestructuringPlannerState(sourceFile, input.program.source.ast);
  const name = allocateSyntheticParameter(state);
  if (actual.kind === "tuple") {
    if (sequence.elements.length !== actual.elements.length) return undefined;
    const tupleType = csharpTypeFromTargetTypeRef(actual);
    const elementType = csharpTypeFromTargetTypeRef(sequence.targetElementType);
    if (tupleType === undefined || elementType === undefined) return undefined;
    const elements = sequence.elements.map((element, index) => applyCsharpConversionSelection(
      sequence.expression, sourceFile, input, diagnostics, element.type, sequence.targetElementType,
      element.conversion, { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name },
        name: csharpTupleElementMemberName(index) }));
    if (elements.some(element => element === undefined)) return undefined;
    return {
      kind: "InvocationExpression",
      callee: { kind: "ParenthesizedExpression", expression: { kind: "CastExpression",
        type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "Func",
          typeArguments: [tupleType, { kind: "ArrayType", elementType }] },
        expression: { kind: "LambdaExpression", parameters: [{ kind: "Parameter", name, type: tupleType }],
          body: { kind: "ArrayCreationExpression", elementType, elements: elements as CsharpExpression[] } } } },
      arguments: [{ kind: "Argument", expression: source }],
    };
  }
  const element = sequence.elements[0];
  if (sequence.elements.length !== 1 || element === undefined) return undefined;
  const type = csharpTypeFromTargetTypeRef(element.type);
  if (type === undefined) return undefined;
  const converted = applyCsharpConversionSelection(sequence.expression, sourceFile, input, diagnostics,
    element.type, sequence.targetElementType, element.conversion, { kind: "IdentifierName", name });
  if (converted === undefined) return undefined;
  return {
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression",
      receiver: { kind: "QualifiedName", left: { kind: "QualifiedName",
        left: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "Tsonic" }, name: "CSharp" }, name: "Js" }, name: "Array" },
      name: "snapshotNumberArguments" },
    arguments: [{ kind: "Argument", expression: source }, { kind: "Argument", expression: {
      kind: "LambdaExpression", parameters: [{ kind: "Parameter", name, type }], body: converted,
    } }],
  };
}
