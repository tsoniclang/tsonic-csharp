import type { SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceCalleeSelection } from "../../../../../policy/types/callables/source-callees.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpPlannedValue } from "../../planned-values.js";
import { planIdentifierExpression, tryPlanProjectSourceModuleStaticMemberReference } from "../../expression-source-references.js";
import { csharpProjectTypeReceiver, translateCsharpSelectedReceiver } from "../../receivers.js";
import { planCsharpSourceMemberName } from "../source-member-names.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";

export function planCsharpNativeFunctionCallee(
  selected: Extract<CsharpSourceCalleeSelection, { readonly kind: "function" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const callee = input.program.source.ast.is.IsIdentifier(selected.expression)
    ? planIdentifierExpression(selected.expression, sourceFile, input, diagnostics)
    : tryPlanProjectSourceModuleStaticMemberReference(selected.expression, sourceFile, input, diagnostics);
  if (callee === undefined) diagnostics.push(unsupportedNodeDiagnostic(selected.expression,
    "A selected native function group has no exact declaration reference syntax."));
  return callee;
}

export function planCsharpNativeMethodCallee(
  selected: Extract<CsharpSourceCalleeSelection, { readonly kind: "method" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
):
  | { readonly kind: "type"; readonly receiver: CsharpExpression; readonly name: string }
  | { readonly kind: "value"; readonly receiver: CsharpPlannedValue; readonly name: string }
  | undefined {
  const classification = input.program.operations.property(selected.expression);
  const selection = classification?.selection;
  const sourceOwned = classification?.sourceOwned;
  if (classification === undefined || selection?.kind !== "source-owned" || sourceOwned === undefined || !selection.source.callCallee ||
    sourceOwned.jsValueOperation.kind !== "not-js-value" || sourceOwned.runtimeUnionProperty.kind !== "not-runtime-union" ||
    sourceOwned.objectShape !== undefined && sourceOwned.shapeMember?.kind !== "resolved" ||
    sourceOwned.shapeMember !== undefined && sourceOwned.shapeMember.kind !== "resolved" ||
    sourceOwned.shapeMember?.kind === "resolved" && sourceOwned.shapeMember.member.memberKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(selected.expression, "A direct source method requires its exact sealed native member selection."));
    return undefined;
  }
  const name = planCsharpSourceMemberName(selected.expression, selection.source.selectedDeclaration, sourceOwned, false, input, diagnostics);
  if (name === undefined) return undefined;
  const projectType = csharpProjectTypeReceiver(selection.source.receiver, input, diagnostics);
  if (projectType !== undefined && classification.receiverProjection?.conversion.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(selected.expression, classification.receiverProjection.conversion.reason));
    return undefined;
  }
  if (projectType !== undefined) return { kind: "type", receiver: projectType, name };
  const receiver = translateCsharpSelectedReceiver(selection.source.receiver, sourceFile, input, diagnostics,
    planExpression, classification.receiverProjection);
  return receiver === undefined ? undefined : { kind: "value", receiver, name };
}
