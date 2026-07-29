import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  translateCsharpConstruction,
} from "../../translate/expressions/constructions.js";
import type {
  CallArgumentPlanner,
} from "./expression-planner-types.js";

export function planNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  return translateCsharpConstruction(
    node,
    sourceFile,
    input,
    diagnostics,
    planCallArgument,
  );
}
