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
import { csharpConversionIsApplicable } from "../../../../policy/conversions/index.js";
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
  if (choice === undefined || choice.inputs.length !== fact.inputs.length ||
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
    const present = getCsharpNullableElementTargetType(selected.carrier);
    if (recorded === undefined || !targetTypeRefEquals(recorded, selected.carrier) ||
      !targetTypeRefEquals(present ?? selected.carrier, selected.presentCarrier) ||
      selected.optional !== (present !== undefined) ||
      selected.elements.some(element => !csharpConversionIsApplicable(element.conversion, "implicit"))) {
      return reject("Borrowed sequence selection lost its exact native storage, presence or element conversion.");
    }
    const value = planValue(selected.expression);
    const type = csharpTypeFromTargetTypeRef(selected.presentCarrier, input.scope.typeParameterNames);
    const elements = selected.elements.map(element => ({ ...element,
      type: csharpTypeFromTargetTypeRef(element.carrier, input.scope.typeParameterNames) }));
    if (value === undefined || type === undefined || elements.some(element => element.type === undefined)) return undefined;
    const name = input.names.temporaryName(`__tsonic_sequence_${input.program.source.ast.pos(selected.expression)}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name };
    const consumed = consume({ carrier: selected.presentCarrier, type, expression: receiver,
      elements: elements as readonly { readonly carrier: typeof selected.carrier; readonly type: CsharpTypeNode;
        readonly conversion: typeof selected.elements[number]["conversion"] }[], lengthMember: selected.lengthMember });
    if (consumed === undefined) return undefined;
    if (!selected.optional) return [...value.prelude,
      { kind: "LocalDeclarationStatement", name, type, initializer: value.value }, ...consumed];
    const otherwise = branch(index + 1);
    if (otherwise === undefined) return undefined;
    return [...value.prelude, { kind: "IfStatement", condition: {
      kind: "IsPatternExpression", expression: value.value, type, designation: name,
    }, thenBody: { kind: "Block", statements: consumed }, elseBody: { kind: "Block", statements: otherwise } }];
  };
  return branch(0);

  function reject(message: string): undefined {
    diagnostics.push(unsupportedNodeDiagnostic(node, message));
    return undefined;
  }
}
