import type { CsharpTranslationContext } from "../../../translate/context/index.js";
import {
  AsArrayLiteralExpression,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import { csharpTupleExpression } from "../csharp-tuples.js";
import {
  plannedArrayElements,
} from "./dense-array.js";
import {
  arrayLiteralHasElision,
  rejectSparseArrayLiteralElision,
} from "./elision.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  csharpNullableTargetType,
  targetTypeRefEquals,
} from "../../../policy/types/index.js";
import type {
  TargetTypeRef,
} from "../../../policy/types/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

export function planTupleLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
  tupleType: CsharpTypeNode | undefined,
  tupleTarget?: Extract<TargetTypeRef, { readonly kind: "tuple" }>,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  const plannedElements = plannedArrayElements(literal.Elements?.Nodes ?? [], sourceFile, input, diagnostics, planner.planExpression);
  if (plannedElements === undefined) {
    return undefined;
  }
  const elements = completeOptionalTupleElements(
    node,
    sourceFile,
    input,
    diagnostics,
    plannedElements,
    tupleTarget,
  );
  if (elements === undefined) {
    return undefined;
  }
  if (elements.length < 2 && tupleType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Tuple literal arity 0 or 1 requires a finalized System.ValueTuple target carrier before C# emission."));
    return undefined;
  }
  return csharpTupleExpression(elements, tupleType ?? { kind: "TupleType", elements: [] });
}

function completeOptionalTupleElements(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  elements: readonly CsharpExpression[],
  tupleTarget: Extract<TargetTypeRef, { readonly kind: "tuple" }> | undefined,
): readonly CsharpExpression[] | undefined {
  if (tupleTarget === undefined || elements.length === tupleTarget.elements.length) {
    return elements;
  }
  if (elements.length > tupleTarget.elements.length) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Tuple literal element count exceeds its exact finalized C# tuple carrier.",
    ));
    return undefined;
  }
  const selection = input.semantics(sourceFile)
    .selectContextualTupleLiteral(node, elements.length);
  if (
    selection.kind !== "selected" ||
    selection.elements.length !== tupleTarget.elements.length
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Tuple literal omission requires exact contextual trailing-optional source evidence before C# emission.",
    ));
    return undefined;
  }
  for (let index = 0; index < selection.elements.length; index += 1) {
    const sourceElement = selection.elements[index]!;
    const authoredTypeNode = sourceElement.declaration === undefined
      ? undefined
      : input.ast.typeNode(sourceElement.declaration);
    const resolved = input.types.resolveSelectedType(
      authoredTypeNode,
      sourceElement.type,
      sourceFile,
    );
    const sourceTarget = resolved === undefined
      ? undefined
      : sourceElement.elementKind === "optional"
        ? csharpNullableTargetType(resolved)
        : resolved;
    if (
      sourceTarget === undefined ||
      !targetTypeRefEquals(sourceTarget, tupleTarget.elements[index]!)
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Contextual tuple element evidence conflicts with its exact finalized C# tuple carrier.",
      ));
      return undefined;
    }
  }
  const completed = elements.slice();
  for (const index of selection.omittedOptionalElementIndexes) {
    const targetType = csharpTypeFromTargetTypeRef(tupleTarget.elements[index]!);
    if (targetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Omitted optional tuple element requires a renderable exact C# target type.",
      ));
      return undefined;
    }
    completed.push({ kind: "DefaultExpression", type: targetType });
  }
  if (completed.length !== tupleTarget.elements.length) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Contextual tuple omission evidence does not complete the exact finalized C# tuple carrier.",
    ));
    return undefined;
  }
  return completed;
}
