import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArrayBindingCarrier, TargetTypeRef } from "../../../../target-model/types/index.js";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../binding-state.js";
import type { ExpressionPlanner } from "../../expressions/expression-planner-types.js";
import type { DestructuringAssignmentPattern, DestructuringAssignmentTarget } from "./entry.js";
import { allocateDestructuringTemp } from "../binding-state.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { requireCsharpIdentifier } from "../../../../target-model/names/identifiers.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { csharpTupleExpression } from "../../types/csharp-tuples.js";
import { csharpConstructibleTypeFromObjectShapeFact, objectShapeStorageMemberName } from "../../objects/index.js";
import { planObjectShapeDefaultProjection } from "../../objects/object-shape-defaults.js";
import { planArrayDefaultProjection } from "../array-defaults.js";
import { planCsharpBindingDefaultValue } from "../optional-values.js";
import { runtimeArrayHelperCall } from "../../expressions/arrays/helpers.js";
import { consumeCsharpPlannedValue } from "../../statements/statement-output.js";
import { qualifiedCsharpType } from "../../types/index.js";

export function planAssignmentPatternFromExpression(
  pattern: DestructuringAssignmentPattern,
  sourceExpression: CsharpExpression,
  _sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  _sourceCarrier: TargetTypeRef | undefined,
  planExpression: ExpressionPlanner,
): readonly CsharpStatement[] {
  const source = input.program.records.bindingPatternProjection.get(pattern.sourceNode)?.source;
  if (source === undefined) return failCsharpPlannerInvariant("Assignment pattern requires its admitted source projection.", pattern.sourceNode);
  const target = (selected: DestructuringAssignmentTarget, value: CsharpExpression, carrier: TargetTypeRef,
    subject: Node, type = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames)): readonly CsharpStatement[] => {
    if (type === undefined) return failCsharpPlannerInvariant("An admitted assignment projection requires a renderable carrier.", subject);
    if (selected.kind === "node") {
      if (!input.program.source.ast.is.IsIdentifier(selected.node)) return failCsharpPlannerInvariant(
        "An admitted direct destructuring target requires native identifier storage.", selected.node);
      return [{ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
        left: { kind: "IdentifierName", name: requireCsharpIdentifier(input.program.source.ast.text(selected.node), diagnostics,
          "Destructuring assignment target") }, right: value } }];
    }
    const name = allocateDestructuringTemp(state);
    return [{ kind: "LocalDeclarationStatement", name, type, initializer: value },
      ...planAssignmentPatternFromExpression(selected.pattern, { kind: "IdentifierName", name }, subject, sourceFile,
        input, diagnostics, state, carrier, planExpression)];
  };
  if (pattern.kind === "array") {
    if (source.kind !== "array-source") return failCsharpPlannerInvariant("Array assignment requires its admitted array source.", pattern.sourceNode);
    const binding = source.bindingCarrier;
    return pattern.elements.flatMap(element => {
      if (element === undefined) return [];
      const projection = input.program.records.bindingPatternProjection.get(element.sourceNode)?.element;
      if (projection?.kind === "array-rest") return target(element.target,
        restExpression(sourceExpression, projection.start, binding, input, element.sourceNode), projection.restCarrier, element.sourceNode);
      if (projection?.kind === "tuple-rest") {
        const type = csharpTypeFromTargetTypeRef(projection.restCarrier, input.scope.typeParameterNames);
        const expression = type === undefined ? undefined : csharpTupleExpression(projection.restCarrier.elements.map((_, offset) => ({
          kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: `Item${projection.start + offset + 1}`,
        })), type);
        return expression === undefined ? [] : target(element.target, expression, projection.restCarrier, element.sourceNode, type);
      }
      if (projection?.kind !== "array-element" || projection.elementCarrier === undefined) return failCsharpPlannerInvariant(
        "Array assignment requires its admitted element projection.", element.sourceNode);
      const projected: CsharpExpression = binding.kind === "tuple"
        ? { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: `Item${projection.index + 1}` }
        : { kind: "ElementAccessExpression", receiver: sourceExpression, arguments: [{ kind: "LiteralExpression", value: projection.index }] };
      const initializer = element.initializer;
      if (initializer === undefined || projection.tupleDefault?.kind === "unused") return target(element.target,
        projected, projection.elementCarrier, element.sourceNode);
      const contract = input.program.records.bindingPatternProjection.get(element.sourceNode)?.defaultValue;
      if (contract === undefined) return failCsharpPlannerInvariant(
        "Assignment default requires its admitted native default contract.", element.sourceNode);
      if (binding.kind === "array") {
        const selected = planArrayDefaultProjection(sourceExpression, projection.index, projected, binding, contract, initializer,
          sourceFile, input, diagnostics, state, planExpression);
        return selected === undefined ? [] : consumeCsharpPlannedValue(selected.value,
          value => target(element.target, value, selected.carrier, element.sourceNode, selected.type));
      }
      if (projection.tupleDefault?.kind !== "planned") return failCsharpPlannerInvariant(
        "Tuple assignment default requires its admitted native use.", element.sourceNode);
      const carrier = projection.tupleDefault.carrier;
      const type = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
      if (type === undefined) return [];
      const value = planExpression(initializer, sourceFile, input, diagnostics, state);
      if (value === undefined) return [];
      const defaulted = planCsharpBindingDefaultValue(initializer, sourceFile, input, diagnostics, projected,
        contract, value, state);
      return defaulted === undefined ? [] : consumeCsharpPlannedValue(defaulted,
        value => target(element.target, value, carrier, element.sourceNode, type));
    });
  }
  if (source.kind !== "object-shape-source") return failCsharpPlannerInvariant(
    "Object assignment requires its admitted structural source.", pattern.sourceNode);
  return pattern.elements.flatMap(element => {
    const projection = input.program.records.bindingPatternProjection.get(element.sourceNode)?.element;
    if (element.kind === "object-rest") {
      if (projection?.kind !== "object-shape-rest") return failCsharpPlannerInvariant(
        "Object rest assignment requires its admitted member correspondence.", element.sourceNode);
      const type = csharpConstructibleTypeFromObjectShapeFact(input, projection.restShape, diagnostics, element.sourceNode);
      if (type === undefined) return [];
      return target(element.target, { kind: "ObjectCreationExpression", type, assignments: projection.members.map(({ rest, source: member }) => ({
        kind: "AssignmentExpression", name: objectShapeStorageMemberName(projection.restShape, rest),
        expression: { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: objectShapeStorageMemberName(source.shape, member) },
      })) }, projection.restShape.targetType, element.sourceNode, type);
    }
    if (projection?.kind !== "object-shape-member") return failCsharpPlannerInvariant(
      "Object assignment requires its admitted native member.", element.sourceNode);
    const member = projection.member;
    const value: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: member.targetName };
    if (element.initializer === undefined) return target(element.target, value, member.type, element.sourceNode);
    const contract = input.program.records.bindingPatternProjection.get(element.sourceNode)?.defaultValue;
    if (contract === undefined) return failCsharpPlannerInvariant(
      "Object assignment default requires its admitted native default contract.", element.sourceNode);
    const selected = planObjectShapeDefaultProjection(value, member, contract, element.initializer, sourceFile, input,
      diagnostics, state, planExpression);
    return selected === undefined ? [] : consumeCsharpPlannedValue(selected.value,
      value => target(element.target, value, selected.carrier, element.sourceNode, selected.type));
  });
}

function restExpression(
  expression: CsharpExpression, index: number, carrier: CsharpArrayBindingCarrier,
  _input: CsharpPlanningContext, subject: Node,
): CsharpExpression {
  if (carrier.kind !== "array") return failCsharpPlannerInvariant("An admitted array rest requires array storage.", subject);
  if (carrier.restSlice === "instance-slice") return { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: "slice" },
    arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: index } }],
  };
  const arguments_ = [{ kind: "Argument" as const, expression },
    { kind: "Argument" as const, expression: { kind: "LiteralExpression" as const, value: index } }];
  return carrier.restSlice === "js-array-helper" ? { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "Array"), name: "slice" },
    arguments: arguments_,
  } : runtimeArrayHelperCall("Slice", arguments_);
}

export function destructuringAssignmentPattern(node: Node, input: CsharpPlanningContext): DestructuringAssignmentPattern | undefined {
  return input.program.records.bindingPatternProjection.get(node)?.assignmentPattern;
}
