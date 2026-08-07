import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type { CsharpTargetParameter } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";

export type PlannedExpression = CsharpExpression | undefined;
export type PlannedArgument = CsharpArgument | undefined;

export type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
) => PlannedExpression;

export type CallArgumentPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  expectedArgumentPassingMode?: CsharpTargetParameter["passingMode"],
  selectedTargetParameter?: CsharpTargetParameter,
) => PlannedArgument;

export type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  expectedTargetType?: TargetTypeRef,
) => PlannedExpression;
