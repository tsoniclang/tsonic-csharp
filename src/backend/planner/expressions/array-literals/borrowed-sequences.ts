import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpBorrowedSequenceInput } from "../../../../target-model/records/borrowed-sequences.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { csharpVoidTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { planCsharpPresentValueGuard } from "../optional-storage.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { csharpPlannedEffect } from "../planned-values.js";
import type { CsharpArraySpreadInput } from "./spread-source.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function planCsharpBorrowedSequenceConsumption(node: Node, fact: CsharpBorrowedSequenceInput,
  _sourceFile: SourceFile, input: CsharpPlanningContext, _diagnostics: TargetDiagnostic[], elementTarget: TargetTypeRef,
  planValue: (node: Node) => CsharpPlannedValue | undefined,
  consume: (source: CsharpArraySpreadInput) => readonly CsharpStatement[] | undefined,
  empty: () => readonly CsharpStatement[] | undefined): CsharpPlannedValue {
  const emission = input.program.records.borrowedSequenceEmission.get(fact, elementTarget);
  if (emission === undefined) failCsharpPlannerInvariant("An admitted borrowed sequence requires its exact native consumption plan.", node);
  const effect = (statements: readonly CsharpStatement[] | undefined): CsharpPlannedValue => csharpPlannedEffect(csharpVoidTargetType(),
    statements ?? failCsharpPlannerInvariant("An admitted sequence requires its native append statements.", node))
      ?? failCsharpPlannerInvariant("An admitted sequence requires its native effect completion.", node);
  const branch = (index: number): CsharpPlannedValue => {
    const selected = emission.inputs[index];
    if (selected === undefined || selected.kind === "empty") return effect(empty());
    const value = planValue(selected.expression)
      ?? failCsharpPlannerInvariant("An admitted borrowed sequence requires its exact native value.", selected.expression);
    if (value.completion.kind === "never") return value;
    if (value.completion.kind !== "value") failCsharpPlannerInvariant("An admitted sequence requires a value completion.", selected.expression);
    const type = csharpTypeFromTargetTypeRef(selected.presentCarrier, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted sequence requires its native present-storage type.", selected.expression);
    const elements = selected.spread.elements.map(element => ({ ...element,
      type: csharpTypeFromTargetTypeRef(element.carrier, input.scope.typeParameterNames)
        ?? failCsharpPlannerInvariant("An admitted sequence requires its native element type.", selected.expression) }));
    const name = input.names.temporaryName(`__tsonic_sequence_${input.program.source.ast.pos(selected.expression)}`);
    const receiver: CsharpExpression = { kind: "IdentifierName", name };
    const guard = selected.optional ? planCsharpPresentValueGuard(selected.carrier, selected.presentCarrier,
      value.completion.expression, name, input) : undefined;
    if (selected.optional && guard === undefined) failCsharpPlannerInvariant("An admitted optional sequence requires its native presence projection.", selected.expression);
    const consumed = consume({ carrier: selected.presentCarrier, type, expression: guard?.value ?? receiver,
      elements, lengthMember: selected.spread.lengthMember, sequence: selected.spread.sequence });
    if (!selected.optional) return effect([...value.prelude,
      { kind: "LocalDeclarationStatement", name, type, initializer: value.completion.expression },
      ...(consumed ?? failCsharpPlannerInvariant("An admitted sequence requires its native append statements.", selected.expression))]);
    const otherwise = branch(index + 1);
    return effect([...value.prelude, { kind: "IfStatement", condition: guard!.condition,
      thenBody: { kind: "Block", statements: consumed ?? failCsharpPlannerInvariant("An admitted sequence requires its native append statements.", selected.expression) },
      elseBody: { kind: "Block", statements: otherwise.prelude } }]);
  };
  return branch(0);
}
