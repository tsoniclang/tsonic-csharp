import type {
  CsharpPlanningContext } from "../context.js";
import {
  AsBindingElement,
  AsBindingPattern,
} from "@tsonic/target-api/source";
import type { Node,
  SourceFile,
} from "@tsonic/tsts";
import type { CsharpBindingProjectionFact } from "../../../target-model/records/value-projections.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import { runtimeArrayHelperCall } from "../expressions/arrays/helpers.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { csharpTupleExpression } from "../types/csharp-tuples.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planArrayDefaultProjection } from "./array-defaults.js";
import type {
  CsharpArrayBindingCarrier,
} from "../../../target-model/types/index.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";
import { planCsharpBindingDefaultValue } from "./optional-values.js";

export function planArrayBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression: ExpressionPlanner | undefined,
): readonly CsharpStatement[] {
  const source = input.program.records.bindingPatternProjection.get(patternNode)?.source;
  if (source?.kind !== "array-source") return failCsharpPlannerInvariant(
    "Array binding requires its admitted native source projection.", patternNode);
  const bindingCarrier = source.bindingCarrier;
  const elements = AsBindingPattern(input.program.source.ast, patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode, index) => {
    if (elementNode === undefined || input.program.source.ast.kindName(elementNode) === "KindOmittedExpression") {
      return [];
    }
    const fact = input.program.records.bindingPatternProjection.get(elementNode);
    return planArrayBindingElement(elementNode, sourceExpression, index, fact, bindingCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planExpression);
  });
}



function planArrayBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  index: number,
  fact: CsharpBindingProjectionFact | undefined,
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression: ExpressionPlanner | undefined,
): readonly CsharpStatement[] {
  const element = AsBindingElement(input.program.source.ast, elementNode);
  if (element === undefined) {
    failCsharpPlannerInvariant("An admitted array pattern lost its checked binding element.", elementNode);
  }
  if (element.DotDotDotToken !== undefined) {
    return planArrayRestBindingElement(elementNode, element.name, sourceExpression, index, fact, sourceCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  const name = element.name;
  if (name === undefined) {
    return [];
  }
  const projected = planArrayBindingProjection(sourceExpression, index, sourceCarrier);
  const selected = fact?.element;
  if (selected?.kind !== "array-element" || selected.elementCarrier === undefined) {
    failCsharpPlannerInvariant("An admitted array element lost its exact native carrier rendering.", elementNode);
  }
  const projectedType = csharpTypeFromTargetTypeRef(selected.elementCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    failCsharpPlannerInvariant("An admitted array element lost its exact native carrier rendering.", elementNode);
  }
  if (element.Initializer !== undefined) {
    if (sourceCarrier.kind !== "array") {
      const defaultedElementCarrier = selected.tupleDefault?.kind === "planned" ? selected.tupleDefault.carrier : undefined;
      if (defaultedElementCarrier !== undefined) {
        if (fact?.defaultValue === undefined) return failCsharpPlannerInvariant(
          "Tuple default requires its admitted native default contract.", elementNode);
        const defaultedElementType = csharpTypeFromTargetTypeRef(
          defaultedElementCarrier, input.scope.typeParameterNames,
        );
        if (
          defaultedElementType === undefined ||
          planExpression === undefined
        ) {
          failCsharpPlannerInvariant("An admitted tuple default lost its native rendering or active expression planner.", element.Initializer);
        }
        const whenNull = planExpression(element.Initializer, sourceFile, input, diagnostics, state
        );
        if (whenNull === undefined) {
          return [];
        }
        const defaulted = planCsharpBindingDefaultValue(element.Initializer, sourceFile, input, diagnostics,
          projected, fact.defaultValue, whenNull, state);
        return defaulted === undefined ? [] : consumeCsharpPlannedValue(defaulted, expression => planBindingNameFromProjection(
          name, expression,
          elementNode,
          sourceFile,
          input,
          diagnostics,
          state,
        ));
      }
      return planBindingNameFromProjection(name, projected, elementNode, sourceFile, input, diagnostics, state);
    }
    if (planExpression === undefined) {
      failCsharpPlannerInvariant("An admitted array default requires its active expression planner.", element.Initializer);
    }
    const contract = fact?.defaultValue;
    if (contract === undefined) return failCsharpPlannerInvariant(
      "Array default requires its admitted native default contract.", elementNode);
    const defaultedProjection = planArrayDefaultProjection(sourceExpression, index, projected, sourceCarrier, contract, element.Initializer, sourceFile, input, diagnostics, state, planExpression);
    if (defaultedProjection === undefined) {
      return [];
    }
    return consumeCsharpPlannedValue(defaultedProjection.value, expression =>
      planBindingNameFromProjection(name, expression, elementNode, sourceFile, input, diagnostics, state));
  }
  return planBindingNameFromProjection(name, projected, elementNode, sourceFile, input, diagnostics, state);
}

function planArrayBindingProjection(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: CsharpArrayBindingCarrier,
): CsharpExpression {
  if (sourceCarrier.kind === "tuple") {
    return {
      kind: "SimpleMemberAccessExpression",
      receiver: sourceExpression,
      name: `Item${index + 1}`,
    };
  }
  return {
    kind: "ElementAccessExpression",
    receiver: sourceExpression,
    arguments: [{ kind: "LiteralExpression", value: index }],
  };
}

function planArrayRestBindingElement(
  elementNode: Node,
  name: Node | undefined,
  sourceExpression: CsharpExpression,
  index: number,
  fact: CsharpBindingProjectionFact | undefined,
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  if (sourceCarrier.kind !== "array") {
    return planTupleRestBindingElement(elementNode, name, sourceExpression, index, fact, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  if (name === undefined) {
    failCsharpPlannerInvariant("An admitted array rest lost its checked binding name.", elementNode);
  }
  const projectedType = csharpTypeFromTargetTypeRef(sourceCarrier.restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    failCsharpPlannerInvariant("An admitted array rest lost its native carrier rendering.", elementNode);
  }
  const projected = planArrayRestProjection(sourceExpression, index, sourceCarrier);
  return planBindingNameFromProjection(name, projected, elementNode, sourceFile, input, diagnostics, state);
}

function planTupleRestBindingElement(
  elementNode: Node,
  name: Node | undefined,
  sourceExpression: CsharpExpression,
  index: number,
  fact: CsharpBindingProjectionFact | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  if (name === undefined) {
    failCsharpPlannerInvariant("An admitted tuple rest lost its checked binding name.", elementNode);
  }
  const selected = fact?.element;
  if (selected?.kind !== "tuple-rest") return failCsharpPlannerInvariant(
    "Tuple rest binding requires its admitted tuple projection.", elementNode);
  const restCarrier = selected.restCarrier;
  const projectedType = csharpTypeFromTargetTypeRef(restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    failCsharpPlannerInvariant("An admitted tuple rest lost its native carrier rendering.", elementNode);
  }
  const projectedElements = restCarrier.elements.map((_, offset) => ({
      kind: "SimpleMemberAccessExpression" as const,
      receiver: sourceExpression,
      name: `Item${index + offset + 1}`,
    }));
  const projected = csharpTupleExpression(projectedElements, projectedType);
  return planBindingNameFromProjection(name, projected, elementNode, sourceFile, input, diagnostics, state);
}

function planArrayRestProjection(
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "array" }>,
): CsharpExpression {
  if (sourceCarrier.restSlice === "instance-slice") {
    return {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: sourceExpression,
        name: "slice",
      },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: index } }],
    };
  }
  const argumentsList = [
    { kind: "Argument" as const, expression: sourceExpression },
    { kind: "Argument" as const, expression: { kind: "LiteralExpression" as const, value: index } },
  ];
  return sourceCarrier.restSlice === "js-array-helper"
    ? {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: {
            kind: "QualifiedName",
            left: {
              kind: "QualifiedName",
              left: {
                kind: "QualifiedName",
                left: { kind: "IdentifierName", name: "Tsonic" },
                name: "CSharp",
              },
              name: "Js",
            },
            name: "Array",
          },
          name: "slice",
        },
        arguments: argumentsList,
      }
    : runtimeArrayHelperCall("Slice", argumentsList);
}
