import { allocateDestructuringTemp } from "./binding-state.js";
import { csharpDestructuringAssignmentSyntax } from "../../../target-model/syntax/operators.js";
import { getCsharpTypeForExpressionCarrier } from "./binding-patterns.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpPlannedValue, type CsharpPlannedValue } from "../expressions/planned-values.js";
import { planCsharpPlannedDiscard } from "../statements/statement-output.js";

import type { CsharpArrayBindingCarrier } from "../../../target-model/types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planIdentifierExpression } from "../expressions/expression-source-references.js";
import { applyCsharpConversionSelection } from "../expressions/conversions.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpTupleExpression } from "../types/csharp-tuples.js";
import { csharpConstructibleTypeFromObjectShapeFact, objectShapeStorageMemberName } from "../objects/index.js";
import { planObjectShapeDefaultProjection } from "../objects/object-shape-defaults.js";
import { planArrayDefaultProjection } from "./array-defaults.js";
import { planCsharpBindingDefaultValue } from "./optional-values.js";
import { runtimeArrayHelperCall } from "../expressions/arrays/helpers.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";
import { qualifiedCsharpType } from "../types/index.js";
import type { CsharpDestructuringAssignmentPattern, CsharpDestructuringAssignmentTarget } from "../../../target-model/records/value-projections.js";

export function isDestructuringAssignmentExpression(
  node: Node | undefined,
  input: CsharpPlanningContext,
): boolean {
  return csharpDestructuringAssignmentSyntax(input.program.source.ast, node) !== undefined;
}

export function planDestructuringAssignmentStatement(node: Node | undefined, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState, planExpression: ExpressionPlanner
): readonly CsharpStatement[] | undefined {
  if (!isDestructuringAssignmentExpression(node, input)) {
    return undefined;
  }
  const planned = planDestructuringAssignmentCore(node!, sourceFile, input, diagnostics, state, planExpression
  );
  return planned === undefined ? [] : planCsharpPlannedDiscard(planned);
}

export function tryPlanDestructuringAssignmentExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState | undefined, planExpression: ExpressionPlanner
): CsharpPlannedValue | undefined {
  if (!isDestructuringAssignmentExpression(node, input)) {
    return undefined;
  }
  if (state === undefined) {
    failCsharpPlannerInvariant("An admitted destructuring assignment lost its owning native rendering scope.", node);
  }
  const planned = planDestructuringAssignmentCore(node, sourceFile, input, diagnostics, state, planExpression
  );
  if (planned === undefined) {
    return undefined;
  }
  return planned;
}

function planDestructuringAssignmentCore(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState, planExpression: ExpressionPlanner
): CsharpPlannedValue | undefined {
  const selectedOperator = input.program.records.binaryOperation.get(node)
    ?.destructuring;
  if (selectedOperator?.kind !== "resolved") failCsharpPlannerInvariant(
    "An admitted destructuring assignment lost its resolved native operation.", node);
  const left = selectedOperator.pattern;
  const right = selectedOperator.source;
  const pattern = input.program.records.bindingPatternProjection.get(node)?.assignmentPattern;
  if (pattern === undefined || pattern.sourceNode !== left) failCsharpPlannerInvariant(
    "An admitted destructuring assignment lost its exact checked assignment pattern.", left);
  const sourceExpression = planExpression(right, sourceFile, input, diagnostics, state);
  if (sourceExpression === undefined) {
    return undefined;
  }
  if (sourceExpression.completion.kind === "never") return sourceExpression;
  if (sourceExpression.completion.kind !== "value") return undefined;
  const sourceType = getCsharpTypeForExpressionCarrier(right, input, diagnostics, left, "Destructuring assignment source");
  const tempName = allocateDestructuringTemp(state);
  const tempReference: CsharpExpression = { kind: "IdentifierName", name: tempName };
  return csharpPlannedValue(sourceExpression.completion.carrier, tempReference, [
    ...sourceExpression.prelude,
    {
      kind: "LocalDeclarationStatement",
      name: tempName,
      type: sourceType,
      initializer: sourceExpression.completion.expression,
    },
    ...planAssignmentPatternFromExpression(
      pattern,
      tempReference,
      sourceFile,
      input,
      diagnostics,
      state,
      planExpression,
    ),
    ]);
}

function planAssignmentPatternFromExpression(
  pattern: CsharpDestructuringAssignmentPattern,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner,
): readonly CsharpStatement[] {
  const source = input.program.records.bindingPatternProjection.get(pattern.sourceNode)?.source;
  if (source === undefined) return failCsharpPlannerInvariant("Assignment pattern requires its admitted source projection.", pattern.sourceNode);
  const target = (selected: CsharpDestructuringAssignmentTarget, value: CsharpExpression,
    subject: Node): readonly CsharpStatement[] => {
    const binding = input.program.records.bindingPatternProjection.get(subject)?.binding;
    const destination = selected.kind === "node" ? selected.node : selected.pattern.sourceNode;
    if (binding === undefined || binding.node !== destination) return failCsharpPlannerInvariant(
      "An admitted assignment projection lost its exact extraction, storage and conversion.", subject);
    const type = csharpTypeFromTargetTypeRef(binding.target, input.scope.typeParameterNames);
    if (type === undefined) return failCsharpPlannerInvariant("An admitted assignment projection requires a renderable carrier.", subject);
    const converted = applyCsharpConversionSelection(subject, sourceFile, input, diagnostics,
      binding.source, binding.target, binding.conversion, value);
    if (converted === undefined) return failCsharpPlannerInvariant(
      "An admitted assignment conversion lost its selected native renderer.", subject);
    if (selected.kind === "node") {
      if (!input.program.source.ast.is.IsIdentifier(selected.node)) return failCsharpPlannerInvariant(
        "An admitted direct destructuring target requires native identifier storage.", selected.node);
      const left = planIdentifierExpression(selected.node, sourceFile,
        { ...input, storageExpression: selected.node }, diagnostics, state);
      if (left === undefined) return [];
      return [{ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
        left, right: converted } }];
    }
    const name = allocateDestructuringTemp(state);
    return [{ kind: "LocalDeclarationStatement", name, type, initializer: converted },
      ...planAssignmentPatternFromExpression(selected.pattern, { kind: "IdentifierName", name }, sourceFile,
        input, diagnostics, state, planExpression)];
  };
  if (pattern.kind === "array") {
    if (source.kind !== "array-source") return failCsharpPlannerInvariant("Array assignment requires its admitted array source.", pattern.sourceNode);
    const binding = source.bindingCarrier;
    return pattern.elements.flatMap(element => {
      if (element === undefined) return [];
      const projection = input.program.records.bindingPatternProjection.get(element.sourceNode)?.element;
      if (projection?.kind === "array-rest") return target(element.target,
        restExpression(sourceExpression, projection.start, binding, input, element.sourceNode), element.sourceNode);
      if (projection?.kind === "tuple-rest") {
        const type = csharpTypeFromTargetTypeRef(projection.restCarrier, input.scope.typeParameterNames);
        const expression = type === undefined ? undefined : csharpTupleExpression(projection.restCarrier.elements.map((_, offset) => ({
          kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: `Item${projection.start + offset + 1}`,
        })), type);
        return expression === undefined ? [] : target(element.target, expression, element.sourceNode);
      }
      if (projection?.kind !== "array-element" || projection.elementCarrier === undefined) return failCsharpPlannerInvariant(
        "Array assignment requires its admitted element projection.", element.sourceNode);
      const projected: CsharpExpression = binding.kind === "tuple"
        ? { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: `Item${projection.index + 1}` }
        : { kind: "ElementAccessExpression", receiver: sourceExpression, arguments: [{ kind: "LiteralExpression", value: projection.index }] };
      const initializer = element.initializer;
      if (initializer === undefined || projection.tupleDefault?.kind === "unused") return target(element.target,
        projected, element.sourceNode);
      const contract = input.program.records.bindingPatternProjection.get(element.sourceNode)?.defaultValue;
      if (contract === undefined) return failCsharpPlannerInvariant(
        "Assignment default requires its admitted native default contract.", element.sourceNode);
      if (binding.kind === "array") {
        const selected = planArrayDefaultProjection(sourceExpression, projection.index, projected, binding, contract, initializer,
          sourceFile, input, diagnostics, state, planExpression);
        return selected === undefined ? [] : consumeCsharpPlannedValue(selected.value,
          value => target(element.target, value, element.sourceNode));
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
        value => target(element.target, value, element.sourceNode));
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
      })) }, element.sourceNode);
    }
    if (projection?.kind !== "object-shape-member") return failCsharpPlannerInvariant(
      "Object assignment requires its admitted native member.", element.sourceNode);
    const member = projection.member;
    const value: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: member.targetName };
    if (element.initializer === undefined) return target(element.target, value, element.sourceNode);
    const contract = input.program.records.bindingPatternProjection.get(element.sourceNode)?.defaultValue;
    if (contract === undefined) return failCsharpPlannerInvariant(
      "Object assignment default requires its admitted native default contract.", element.sourceNode);
    const selected = planObjectShapeDefaultProjection(value, member, contract, element.initializer, sourceFile, input,
      diagnostics, state, planExpression);
    return selected === undefined ? [] : consumeCsharpPlannedValue(selected.value,
      value => target(element.target, value, element.sourceNode));
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
