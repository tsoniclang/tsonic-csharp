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

export function planTupleLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
  tupleType: CsharpTypeNode | undefined,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  const elements = plannedArrayElements(literal.Elements?.Nodes ?? [], sourceFile, input, diagnostics, planner.planExpression);
  if (elements === undefined) {
    return undefined;
  }
  if (elements.length < 2 && tupleType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Tuple literal arity 0 or 1 requires a finalized System.ValueTuple target carrier before C# emission."));
    return undefined;
  }
  return csharpTupleExpression(elements, tupleType ?? { kind: "TupleType", elements: [] });
}
