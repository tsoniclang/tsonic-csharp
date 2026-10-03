import type {
  CsharpPlanningContext } from "../../context.js";
import { planCsharpNativeArray } from "../native-memory.js";
import {
  AsArrayLiteralExpression,
  HasSourceKind,
  KindSpreadElement,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  arrayLiteralHasElision,
  rejectSparseArrayLiteralElision,
} from "./elision.js";
import { planCsharpArrayConstruction } from "./construction.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { buildCsharpPlannedValue } from "../planned-value-composition.js";

export function planArrayLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  planner: ArrayLiteralPlanner,
  elementTargetType?: TargetTypeRef,
): CsharpPlannedValue | undefined {
  const literal = AsArrayLiteralExpression(input.program.source.ast, node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  if ((literal.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.program.source.ast, element, KindSpreadElement))) {
    if (elementTargetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Dense array construction requires its exact element carrier."));
      return undefined;
    }
    return planCsharpArrayConstruction(node, sourceFile, input, diagnostics, elementType, elementTargetType, planner);
  }
  const elements = plannedArrayElements(literal.Elements?.Nodes ?? [], sourceFile, input, diagnostics, (element, elementSourceFile, elementInput, elementDiagnostics) =>
    planner.planExpressionWithExpectedType(element, elementSourceFile, elementInput, elementDiagnostics, elementType, undefined, elementTargetType));
  if (elements === undefined) {
    return undefined;
  }
  return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, elements, values => {
  const array: CsharpExpression = {
    kind: "ArrayCreationExpression",
    elementType,
    elements: values,
  };
  const native = input.program.storage.nativeArray(node);
  return native === undefined ? array : planCsharpNativeArray(input.scope.typeParameterNames, array, native.layout, native.stride);
  });
}

export function plannedArrayElements(
  elements: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
  ) => CsharpPlannedValue | undefined,
): readonly CsharpPlannedValue[] | undefined {
  const planned: CsharpPlannedValue[] = [];
  for (const element of elements) {
    if (element === undefined) {
      continue;
    }
    const expression = planExpression(element, sourceFile, input, diagnostics);
    if (expression === undefined) {
      return undefined;
    }
    planned.push(expression);
  }
  return planned;
}
