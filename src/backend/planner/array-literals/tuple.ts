import {
  AsArrayLiteralExpression,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import type {
  ArrayLiteralPlanner,
} from "./types.js";
import {
  plannedArrayElements,
} from "./dense-array.js";
import {
  arrayLiteralHasElision,
  rejectSparseArrayLiteralElision,
} from "./elision.js";

export function planTupleLiteralExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const literal = AsArrayLiteralExpression(node)!;
  if (arrayLiteralHasElision(node, input)) {
    return rejectSparseArrayLiteralElision(node, diagnostics);
  }
  const elements = plannedArrayElements(literal.Elements?.Nodes ?? [], sourceFile, input, diagnostics, planner.planExpression);
  if (elements === undefined) {
    return undefined;
  }
  return {
    kind: "TupleExpression",
    elements,
  };
}
