import type { SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpMethodDeclaration } from "../../target-ast/syntax/index.js";
import type { CsharpModuleCallableEmission } from "../../../target-model/records/program/source-file-emission.js";
import { createDestructuringPlannerState } from "../bindings/index.js";
import { planCsharpArrowLambdaSyntax, planCsharpCapturedFunctionLambdaSyntax } from "../expressions/callable.js";
import { planExpression } from "../expressions/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { planCsharpNativeMemberHiding } from "../declarations/modifiers.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";

export function planCsharpModuleCallable(selected: CsharpModuleCallableEmission, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): CsharpMethodDeclaration {
  const context = { ...input, scope: { ...input.scope,
    nativeCallableBody: { declaration: selected.initializer, carrier: selected.carrier },
  } };
  const state = createDestructuringPlannerState(selected.initializer, input.program.source.ast);
  const self = input.program.records.namedSelf.get(selected.initializer);
  if (self !== undefined) for (const reference of [...self.calls, ...self.values])
    state.expressionOverrides.set(reference, { kind: "IdentifierName", name: selected.name });
  const syntax = selected.adapted ? planAdaptedModuleCallable(selected, sourceFile, input, diagnostics, state)
    : selected.form === "arrow"
    ? planCsharpArrowLambdaSyntax(selected.initializer, sourceFile, context, diagnostics, planExpression, state)
    : planCsharpCapturedFunctionLambdaSyntax(selected.initializer, sourceFile, context, diagnostics, state);
  if (syntax === undefined) failCsharpPlannerInvariant("An admitted native module callable requires its planned parameters and body.", selected.initializer);
  const parameters = syntax.parameters.map((parameter, index) => {
    const carrier = selected.parameters[index];
    const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted module callable parameter requires its selected native ABI.", selected.initializer);
    return { ...parameter, type };
  });
  const returnType = csharpTypeFromTargetTypeRef(selected.returnCarrier, input.scope.typeParameterNames);
  if (returnType === undefined) failCsharpPlannerInvariant("An admitted module callable requires its selected native return ABI.", selected.initializer);
  return { kind: "MethodDeclaration", name: selected.name,
    modifiers: [selected.visibility, "static", ...(selected.async ? ["async" as const] : []),
      ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding,
        { kind: "source", declaration: selected.declaration, role: "member" })],
    returnType, parameters, body: syntax.body.kind === "Block" ? syntax.body
      : { kind: "Block", statements: [selected.returnMode === "void"
        ? { kind: "ExpressionStatement", expression: syntax.body }
        : { kind: "ReturnStatement", expression: syntax.body }] },
  };
}

// An adapted binding's method is the initializer value planned in its stored carrier: the conversion wraps the
// implementation (for example an async local function returned through the stored union's Task alternative).
function planAdaptedModuleCallable(selected: CsharpModuleCallableEmission, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): Extract<CsharpExpression, { readonly kind: "LambdaExpression" }> | undefined {
  const planned = planExpression(selected.initializer, sourceFile, input, diagnostics, state);
  if (planned === undefined) return undefined;
  if (planned.prelude.length !== 0 || planned.completion.kind !== "value" || planned.completion.expression.kind !== "LambdaExpression")
    failCsharpPlannerInvariant("An admitted adapted module callable requires its stored lambda value without a prelude.", selected.initializer);
  return planned.completion.expression;
}
