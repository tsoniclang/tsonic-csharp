import type {
  CsharpPlanningContext } from "../context.js";
import {
  AsBindingElement,
  AsBindingPattern,
} from "@tsonic/target-api/source";
import type { Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import { runtimeArrayHelperCall } from "../expressions/arrays/helpers.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { csharpTupleExpression } from "../types/csharp-tuples.js";
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../diagnostics.js";
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
  _sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression: ExpressionPlanner | undefined,
  _sourceCarrierOverride?: TargetTypeRef,
): readonly CsharpStatement[] {
  const source = input.program.records.bindingPatternProjection.get(patternNode)?.source;
  if (source?.kind !== "array-source") return failCsharpPlannerInvariant(
    "Array binding requires its admitted native source projection.", patternNode);
  const bindingCarrier = source.bindingCarrier;
  const elements = AsBindingPattern(input.program.source.ast, patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode, index) => {
    if (elementNode === undefined) {
      return [];
    }
    const selected = input.program.records.bindingPatternProjection.get(elementNode)?.element;
    const elementCarrier = selected?.kind === "array-element" ? selected.elementCarrier : undefined;
    return planArrayBindingElement(elementNode, sourceExpression, index, elementCarrier, bindingCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planExpression);
  });
}



function planArrayBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  index: number,
  elementCarrier: TargetTypeRef | undefined,
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
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    return planArrayRestBindingElement(elementNode, element.name, sourceExpression, index, sourceCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  const name = element.name;
  if (name === undefined) {
    return [];
  }
  const projected = planArrayBindingProjection(sourceExpression, index, sourceCarrier);
  const projectedType = elementCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(elementCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array destructuring element requires a renderable provider element carrier type before C# emission."));
    return [];
  }
  if (element.Initializer !== undefined) {
    if (sourceCarrier.kind !== "array") {
      const fact = input.program.records.bindingPatternProjection.get(elementNode);
      const selected = fact?.element;
      if (selected?.kind !== "array-element") return failCsharpPlannerInvariant(
        "Tuple default requires its admitted element projection.", elementNode);
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
          diagnostics.push(unsupportedNodeDiagnostic(
            element.Initializer,
            "Tuple destructuring defaults require a renderable non-nullish element type and the active expression planner.",
          ));
          return [];
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
          defaultedElementType,
          elementNode,
          sourceFile,
          input,
          diagnostics,
          state,
          defaultedElementCarrier,
        ));
      }
      return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
    }
    if (planExpression === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Array destructuring defaults require the active expression planner before C# emission."));
      return [];
    }
    const contract = input.program.records.bindingPatternProjection.get(elementNode)?.defaultValue;
    if (contract === undefined) return failCsharpPlannerInvariant(
      "Array default requires its admitted native default contract.", elementNode);
    const defaultedProjection = planArrayDefaultProjection(sourceExpression, index, projected, sourceCarrier, contract, element.Initializer, sourceFile, input, diagnostics, state, planExpression);
    if (defaultedProjection === undefined) {
      return [];
    }
    return consumeCsharpPlannedValue(defaultedProjection.value, expression =>
      planBindingNameFromProjection(name, expression, defaultedProjection.type, elementNode, sourceFile, input, diagnostics, state, defaultedProjection.carrier));
  }
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, elementCarrier);
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
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  if (sourceCarrier.kind !== "array") {
    return planTupleRestBindingElement(elementNode, name, sourceExpression, index, sourceCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection);
  }
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array rest destructuring requires a target binding name."));
    return [];
  }
  const projectedType = csharpTypeFromTargetTypeRef(sourceCarrier.restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array rest destructuring requires a renderable provider array carrier type before C# emission."));
    return [];
  }
  const projected = planArrayRestProjection(sourceExpression, index, sourceCarrier);
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, sourceCarrier.restCarrier);
}

function planTupleRestBindingElement(
  elementNode: Node,
  name: Node | undefined,
  sourceExpression: CsharpExpression,
  index: number,
  _sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "tuple" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Tuple rest destructuring requires a target binding name."));
    return [];
  }
  const selected = input.program.records.bindingPatternProjection.get(elementNode)?.element;
  if (selected?.kind !== "tuple-rest") return failCsharpPlannerInvariant(
    "Tuple rest binding requires its admitted tuple projection.", elementNode);
  const restCarrier = selected.restCarrier;
  const projectedType = csharpTypeFromTargetTypeRef(restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Tuple rest destructuring requires a renderable provider tuple carrier type before C# emission."));
    return [];
  }
  const projectedElements = restCarrier.elements.map((_, offset) => ({
      kind: "SimpleMemberAccessExpression" as const,
      receiver: sourceExpression,
      name: `Item${index + offset + 1}`,
    }));
  const projected = csharpTupleExpression(projectedElements, projectedType);
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, restCarrier);
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
