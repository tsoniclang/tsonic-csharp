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
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import { runtimeArrayHelperCall } from "../expressions/arrays/helpers.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { csharpTupleExpression } from "../types/csharp-tuples.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { CsharpBindingElementProjection, CsharpBindingPatternSource } from "../../../target-model/records/value-projections.js";
import { planArrayDefaultProjection } from "./array-defaults.js";
import type {
  CsharpArrayBindingCarrier,
} from "../../../target-model/types/index.js";
import type { CsharpPlannedValue } from "../expressions/planned-values.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";
import { planCsharpBindingDefaultValue } from "./optional-values.js";

export const missingBindingPatternProjectionMessage = "Destructuring requires its sealed binding-pattern projection before C# emission.";

export function bindingPatternSource<Kind extends CsharpBindingPatternSource["kind"]>(
  node: Node,
  kind: Kind,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): Extract<CsharpBindingPatternSource, { readonly kind: Kind }> | undefined {
  const source = input.program.records.bindingPatternProjection.get(node)?.source;
  if (source?.kind === kind) {
    return source as Extract<CsharpBindingPatternSource, { readonly kind: Kind }>;
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, missingBindingPatternProjectionMessage));
  return undefined;
}

export function bindingElementProjection<Kind extends CsharpBindingElementProjection["kind"]>(
  node: Node,
  kind: Kind,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): Extract<CsharpBindingElementProjection, { readonly kind: Kind }> | undefined {
  const element = input.program.records.bindingPatternProjection.get(node)?.element;
  if (element?.kind === kind) {
    return element as Extract<CsharpBindingElementProjection, { readonly kind: Kind }>;
  }
  diagnostics.push(unsupportedNodeDiagnostic(node, missingBindingPatternProjectionMessage));
  return undefined;
}

export function planArrayBindingPattern(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
): readonly CsharpStatement[] {
  const source = bindingPatternSource(patternNode, "array-source", input, diagnostics);
  if (source === undefined) {
    return [];
  }
  const bindingCarrier = source.bindingCarrier;
  const elements = AsBindingPattern(input.program.source.ast, patternNode)?.Elements?.Nodes ?? [];
  return elements.flatMap((elementNode, index) => {
    if (elementNode === undefined) {
      return [];
    }
    return planArrayBindingElement(elementNode, sourceExpression, index, bindingCarrier, sourceFile, input, diagnostics, state, planBindingNameFromProjection, planDefaultExpressionWithExpectedType);
  });
}

export type BindingDefaultExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
) => CsharpPlannedValue | undefined;

function planArrayBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: CsharpArrayBindingCarrier,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner | undefined,
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
  const projection = bindingElementProjection(elementNode, "array-element", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const elementCarrier = projection.elementCarrier;
  const projected = planArrayBindingProjection(sourceExpression, index, sourceCarrier);
  const projectedType = elementCarrier === undefined ? undefined : csharpTypeFromTargetTypeRef(elementCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array destructuring element requires a renderable provider element carrier type before C# emission."));
    return [];
  }
  if (element.Initializer !== undefined) {
    if (sourceCarrier.kind !== "array") {
      const tupleDefault = projection.tupleDefault;
      if (tupleDefault === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(elementNode, missingBindingPatternProjectionMessage));
        return [];
      }
      if (tupleDefault.kind === "planned") {
        const defaultedElementCarrier = tupleDefault.carrier;
        const defaultedElementType = csharpTypeFromTargetTypeRef(
          defaultedElementCarrier, input.scope.typeParameterNames,
        );
        if (
          defaultedElementType === undefined ||
          planDefaultExpressionWithExpectedType === undefined
        ) {
          diagnostics.push(unsupportedNodeDiagnostic(
            element.Initializer,
            "Tuple destructuring defaults require a renderable non-nullish element type and the active expression planner.",
          ));
          return [];
        }
        const whenNull = planDefaultExpressionWithExpectedType(
          element.Initializer,
          sourceFile,
          input,
          diagnostics,
          defaultedElementType,
          element.Initializer,
          state,
          defaultedElementCarrier,
        );
        if (whenNull === undefined) {
          return [];
        }
        const defaulted = planCsharpBindingDefaultValue(element.Initializer, sourceFile, input, diagnostics,
          projected, elementCarrier!, whenNull, defaultedElementCarrier, state);
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
    if (planDefaultExpressionWithExpectedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Array destructuring defaults require the active expression planner before C# emission."));
      return [];
    }
    const defaultedProjection = planArrayDefaultProjection(sourceExpression, index, projected, sourceCarrier, element.Initializer, sourceFile, input, diagnostics, state, planDefaultExpressionWithExpectedType);
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
  const projection = bindingElementProjection(elementNode, "array-rest", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const projectedType = csharpTypeFromTargetTypeRef(projection.restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Array rest destructuring requires a renderable provider array carrier type before C# emission."));
    return [];
  }
  const projected = planArrayRestProjection(sourceExpression, index, sourceCarrier);
  return planBindingNameFromProjection(name, projected, projectedType, elementNode, sourceFile, input, diagnostics, state, projection.restCarrier);
}

function planTupleRestBindingElement(
  elementNode: Node,
  name: Node | undefined,
  sourceExpression: CsharpExpression,
  index: number,
  sourceCarrier: Extract<CsharpArrayBindingCarrier, { readonly kind: "tuple" }>,
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
  const projection = bindingElementProjection(elementNode, "tuple-rest", input, diagnostics);
  if (projection === undefined) {
    return [];
  }
  const restElements = sourceCarrier.elements.slice(index);
  const restCarrier = projection.restCarrier;
  const projectedType = csharpTypeFromTargetTypeRef(restCarrier, input.scope.typeParameterNames);
  if (projectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Tuple rest destructuring requires a renderable provider tuple carrier type before C# emission."));
    return [];
  }
  const projectedElements = restElements.map((_, offset) => ({
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
