import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceSequenceInputChoice, sourceSequenceInputIsEmpty } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpBorrowedSequenceInput } from "../../../../analysis/operations/borrowed-sequences.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { getCsharpArrayLiteralElementTargetType, getCsharpCollectionElementTargetType, getCsharpIndexableLengthMemberName } from "../../../../target-model/types/collections.js";
import { csharpVoidTargetType } from "../../../../target-model/types/scalar-types.js";
import { csharpConversionIsApplicable, type CsharpConversionSelection } from "../../../../target-model/conversions/selection.js";
import { planCsharpPresentValueGuard } from "../optional-storage.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { csharpPlannedEffect } from "../planned-values.js";
import type { CsharpArraySpreadInput } from "./spread-source.js";

export function planCsharpBorrowedSequenceConsumption(
  node: Node,
  fact: CsharpBorrowedSequenceInput,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementTarget: TargetTypeRef,
  planValue: (node: Node) => CsharpPlannedValue | undefined,
  consume: (source: CsharpArraySpreadInput) => readonly CsharpStatement[] | undefined,
  empty: () => readonly CsharpStatement[] | undefined,
): CsharpPlannedValue | undefined {
  const choice = sourceSequenceInputChoice(input.program.source.ast, fact.expression);
  const spread = input.program.source.ast.parent(fact.expression);
  const array = spread === undefined ? undefined : input.program.source.ast.parent(spread);
  const sourceCarrier = array === undefined ? undefined : input.types.classifications.resolveNode(array, sourceFile);
  const constructions = array === undefined ? [] : [sourceCarrier, ...input.program.expectedTypes.forExpression(array)
    .map(target => input.program.expectedTypes.arrayLiteralCarrier(array, target))];
  if (choice === undefined || choice.inputs.length !== fact.inputs.length ||
    array !== fact.array || sourceCarrier === undefined || !targetTypeRefEquals(sourceCarrier, fact.sourceCarrier) ||
    !constructions.some(carrier => {
      const element = getCsharpArrayLiteralElementTargetType(carrier);
      return element !== undefined && targetTypeRefEquals(element, elementTarget);
    }) ||
    choice.inputs.some((expression, index) => expression !== fact.inputs[index]?.expression) ||
    choice.controlNodes.length !== fact.controlNodes.length ||
    choice.controlNodes.some((expression, index) => expression !== fact.controlNodes[index])) {
    return reject("Borrowed sequence choice must match its exact finalized source alternatives.");
  }
  const effect = (statements: readonly CsharpStatement[] | undefined): CsharpPlannedValue | undefined =>
    statements === undefined ? undefined : csharpPlannedEffect(csharpVoidTargetType(), statements);
  const branch = (index: number): CsharpPlannedValue | undefined => {
    const selected = fact.inputs[index];
    if (selected === undefined) return effect(empty());
    if (selected.kind === "empty") {
      return sourceSequenceInputIsEmpty(input.program.source.ast, selected.expression)
        ? effect(empty()) : reject("Only an exact empty array literal may omit source construction.");
    }
    const recorded = input.types.classifications.resolveNode(selected.expression, sourceFile);
    const present = getCsharpGenericOptionalParts(selected.carrier)?.element ?? getCsharpNullableElementTargetType(selected.carrier);
    const element = getCsharpCollectionElementTargetType(selected.presentCarrier);
    const carriers = selected.presentCarrier.kind === "tuple" ? selected.presentCarrier.elements : element === undefined ? undefined : [element];
    if (recorded === undefined || !targetTypeRefEquals(recorded, selected.carrier) ||
      !targetTypeRefEquals(present ?? selected.carrier, selected.presentCarrier) ||
      selected.optional !== (present !== undefined) ||
      selected.lengthMember !== getCsharpIndexableLengthMemberName(selected.presentCarrier) ||
      carriers === undefined || carriers.length !== selected.elements.length ||
      carriers.some((carrier, elementIndex) => !targetTypeRefEquals(carrier, selected.elements[elementIndex]!))) {
      return reject("Borrowed sequence selection lost its exact native storage, presence or element conversion.");
    }
    const value = planValue(selected.expression);
    if (value === undefined) return undefined;
    if (value.completion.kind === "never") return value;
    if (value.completion.kind !== "value" || !targetTypeRefEquals(value.completion.carrier, selected.carrier)) {
      return reject("Borrowed sequence consumption requires the finalized value completion, not void or another carrier.");
    }
    const type = csharpTypeFromTargetTypeRef(selected.presentCarrier, input.scope.typeParameterNames);
    const elements = selected.elements.map(carrier => ({ carrier,
      conversion: input.program.conversions.select(carrier, elementTarget, "implicit"),
      type: csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames) }));
    if (elements.some(element => element.conversion === undefined || !csharpConversionIsApplicable(element.conversion, "implicit"))) {
      return reject("Borrowed sequence elements require their sealed exact source/destination conversion pairs.");
    }
    if (type === undefined || elements.some(element => element.type === undefined)) return undefined;
    const name = input.names.temporaryName(`__tsonic_sequence_${input.program.source.ast.pos(selected.expression)}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name };
    const guard = selected.optional ? planCsharpPresentValueGuard(selected.carrier, selected.presentCarrier,
      value.completion.expression, name, input.scope.typeParameterNames) : undefined;
    if (selected.optional && guard === undefined) return reject("Borrowed sequence must use the finalized native optional storage projection.");
    const consumed = consume({ carrier: selected.presentCarrier, type, expression: guard?.value ?? receiver,
      elements: elements as readonly { readonly carrier: typeof selected.carrier; readonly type: CsharpTypeNode;
        readonly conversion: CsharpConversionSelection }[], lengthMember: selected.lengthMember });
    if (consumed === undefined) return undefined;
    if (!selected.optional) return effect([...value.prelude,
      { kind: "LocalDeclarationStatement", name, type, initializer: value.completion.expression }, ...consumed]);
    const otherwise = branch(index + 1);
    if (otherwise === undefined) return undefined;
    return effect([...value.prelude, { kind: "IfStatement", condition: guard!.condition,
      thenBody: { kind: "Block", statements: consumed }, elseBody: { kind: "Block", statements: otherwise.prelude } }]);
  };
  return branch(0);

  function reject(message: string): undefined {
    diagnostics.push(unsupportedNodeDiagnostic(node, message));
    return undefined;
  }
}
