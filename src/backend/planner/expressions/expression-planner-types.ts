import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpTargetParameter } from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import type { CsharpPlannedArgument, CsharpPlannedValue } from "./planned-values.js";

export type PlannedExpression = CsharpPlannedValue | undefined;
export type PlannedArgument = CsharpPlannedArgument | undefined;

export type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
) => PlannedExpression;

export type CallArgumentPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  expectedTargetType?: TargetTypeRef,
  state?: DestructuringPlannerState,
) => PlannedExpression;
