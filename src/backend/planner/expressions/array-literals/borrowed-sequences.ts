import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceSequenceInputChoice, sourceSequenceInputIsEmpty } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpBorrowedSequenceInput } from "../../../../analysis/operations/borrowed-sequences.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { getCsharpCollectionElementTargetType, getCsharpIndexableLengthMemberName } from "../../../../target-model/types/collections.js";
import { csharpConversionIsApplicable, type CsharpConversionSelection } from "../../../../policy/conversions/index.js";
import { planCsharpPresentValueGuard } from "../optional-storage.js";
import type { CsharpArraySpreadInput } from "./spread-source.js";

export function planCsharpBorrowedSequenceConsumption(
  node: Node,
  fact: CsharpBorrowedSequenceInput,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planValue: (node: Node) => { readonly prelude: readonly CsharpStatement[]; readonly value: CsharpExpression } | undefined,
  consume: (source: CsharpArraySpreadInput) => readonly CsharpStatement[] | undefined,
  empty: () => readonly CsharpStatement[] | undefined,
): readonly CsharpStatement[] | undefined {
  const choice = sourceSequenceInputChoice(input.program.source.ast, fact.expression);
  const spread = input.program.source.ast.parent(fact.expression);
  const array = spread === undefined ? undefined : input.program.source.ast.parent(spread);
  const destination = array === undefined ? undefined : input.types.classifications.resolveNode(array, sourceFile);
  const elementTarget = getCsharpCollectionElementTargetType(destination);
  if (choice === undefined || choice.inputs.length !== fact.inputs.length ||
    elementTarget === undefined || !targetTypeRefEquals(elementTarget, fact.elementTarget) ||
    choice.inputs.some((expression, index) => expression !== fact.inputs[index]?.expression) ||
    choice.controlNodes.length !== fact.controlNodes.length ||
    choice.controlNodes.some((expression, index) => expression !== fact.controlNodes[index])) {
    return reject("Borrowed sequence choice must match its exact finalized source alternatives.");
  }
  const branch = (index: number): readonly CsharpStatement[] | undefined => {
    const selected = fact.inputs[index];
    if (selected === undefined) return empty();
    if (selected.kind === "empty") {
      return sourceSequenceInputIsEmpty(input.program.source.ast, selected.expression)
        ? empty() : reject("Only an exact empty array literal may omit source construction.");
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
    const type = csharpTypeFromTargetTypeRef(selected.presentCarrier, input.scope.typeParameterNames);
    const elements = selected.elements.map(carrier => ({ carrier,
      conversion: input.program.conversions.select(carrier, fact.elementTarget, "implicit"),
      type: csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames) }));
    if (elements.some(element => element.conversion === undefined || !csharpConversionIsApplicable(element.conversion, "implicit"))) {
      return reject("Borrowed sequence elements require their sealed exact source/destination conversion pairs.");
    }
    if (value === undefined || type === undefined || elements.some(element => element.type === undefined)) return undefined;
    const name = input.names.temporaryName(`__tsonic_sequence_${input.program.source.ast.pos(selected.expression)}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name };
    const guard = selected.optional ? planCsharpPresentValueGuard(selected.carrier, selected.presentCarrier,
      value.value, name, input.scope.typeParameterNames) : undefined;
    if (selected.optional && guard === undefined) return reject("Borrowed sequence must use the finalized native optional storage projection.");
    const consumed = consume({ carrier: selected.presentCarrier, type, expression: guard?.value ?? receiver,
      elements: elements as readonly { readonly carrier: typeof selected.carrier; readonly type: CsharpTypeNode;
        readonly conversion: CsharpConversionSelection }[], lengthMember: selected.lengthMember });
    if (consumed === undefined) return undefined;
    if (!selected.optional) return [...value.prelude,
      { kind: "LocalDeclarationStatement", name, type, initializer: value.value }, ...consumed];
    const otherwise = branch(index + 1);
    if (otherwise === undefined) return undefined;
    return [...value.prelude, { kind: "IfStatement", condition: guard!.condition,
      thenBody: { kind: "Block", statements: consumed }, elseBody: { kind: "Block", statements: otherwise } }];
  };
  return branch(0);

  function reject(message: string): undefined {
    diagnostics.push(unsupportedNodeDiagnostic(node, message));
    return undefined;
  }
}
