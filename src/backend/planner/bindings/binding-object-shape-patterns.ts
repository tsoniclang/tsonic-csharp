import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpConstructibleTypeFromObjectShapeFact, objectShapeStorageMemberName } from "../objects/index.js";
import { planObjectShapeDefaultProjection } from "../objects/object-shape-defaults.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";
import { planCsharpAbsentValue } from "../expressions/optional-storage.js";
import { planCsharpBindingDefaultValue } from "./optional-values.js";

export function planObjectShapeBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression?: ExpressionPlanner,
): readonly CsharpStatement[] {
  return input.program.source.ast.elements(patternNode).flatMap(elementNode => {
    if (elementNode === undefined) failCsharpPlannerInvariant("An admitted structural binding requires a dense checked element list.", patternNode);
    const element = input.program.source.ast.as.AsBindingElement(elementNode);
    const projection = input.program.records.bindingPatternProjection.get(elementNode)?.element;
    if (element?.name === undefined || projection === undefined) return failCsharpPlannerInvariant(
      "Object binding requires its admitted native element projection.", elementNode);
    if (projection.kind === "object-shape-rest") {
      const type = csharpConstructibleTypeFromObjectShapeFact(input, projection.restShape, diagnostics, elementNode);
      if (type === undefined) failCsharpPlannerInvariant("An admitted structural rest binding requires its native storage type.", elementNode);
      const assignments = projection.members.map(({ rest, source }) => ({
        kind: "AssignmentExpression" as const, name: objectShapeStorageMemberName(projection.restShape, rest),
        expression: { kind: "SimpleMemberAccessExpression" as const, receiver: sourceExpression,
          name: objectShapeStorageMemberName(objectShape, source) },
      }));
      return planBindingNameFromProjection(element.name, { kind: "ObjectCreationExpression", type, assignments },
        elementNode, sourceFile, input, diagnostics, state);
    }
    if (projection.kind === "object-shape-absence") {
      const absent = planCsharpAbsentValue(projection.carrier, input);
      if (absent === undefined) return failCsharpPlannerInvariant(
        "An admitted absent object binding requires its native absence carrier.", elementNode);
      if (element.Initializer === undefined) return planBindingNameFromProjection(element.name, absent,
        elementNode, sourceFile, input, diagnostics, state);
      const contract = input.program.records.bindingPatternProjection.get(elementNode)?.defaultValue;
      if (contract?.kind !== "absence" || planExpression === undefined) return failCsharpPlannerInvariant(
        "An admitted absent object default requires its exact default contract and expression renderer.", elementNode);
      const initial = planExpression(element.Initializer, sourceFile, input, diagnostics, state);
      if (initial === undefined) failCsharpPlannerInvariant("An admitted absent structural binding requires its native default initializer.", elementNode);
      const selected = planCsharpBindingDefaultValue(element.Initializer, sourceFile, input, diagnostics,
        absent, contract, initial, state);
      if (selected === undefined) failCsharpPlannerInvariant("An admitted absent structural binding requires its native default projection.", elementNode);
      return consumeCsharpPlannedValue(selected, expression =>
        planBindingNameFromProjection(element.name!, expression, elementNode, sourceFile, input, diagnostics, state));
    }
    if (projection.kind !== "object-shape-member") return failCsharpPlannerInvariant(
      "Object member binding requires its admitted native member.", elementNode);
    const member = projection.member;
    const type = csharpTypeFromTargetTypeRef(member.type, input.scope.typeParameterNames);
    if (type === undefined) return failCsharpPlannerInvariant("An admitted binding member must be renderable.", elementNode);
    const value: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: member.targetName };
    if (element.Initializer === undefined) return planBindingNameFromProjection(element.name, value,
      elementNode, sourceFile, input, diagnostics, state);
    const contract = input.program.records.bindingPatternProjection.get(elementNode)?.defaultValue;
    if (contract === undefined) return failCsharpPlannerInvariant(
      "Object default requires its admitted native default contract.", elementNode);
    const defaulted = planObjectShapeDefaultProjection(value, member, contract, element.Initializer, sourceFile, input,
      diagnostics, state, planExpression);
    if (defaulted === undefined) failCsharpPlannerInvariant("An admitted structural member default requires its native projection.", elementNode);
    return consumeCsharpPlannedValue(defaulted.value, expression =>
      planBindingNameFromProjection(element.name!, expression, elementNode,
        sourceFile, input, diagnostics, state));
  });
}
