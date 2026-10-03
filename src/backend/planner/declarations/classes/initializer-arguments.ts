import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpParameter } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpPlannedArgument } from "../../expressions/planned-values.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { planCsharpGeneratedMethodCall } from "../generated-methods.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { csharpPlannedArgumentSyntax } from "../../expressions/target-members/selected-call/planned-arguments.js";

export function planCsharpConstructorInitializerArgument(
  node: Node, planned: CsharpPlannedArgument, parameters: readonly CsharpParameter[],
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], expectedCarrier?: TargetTypeRef,
): CsharpArgument | undefined {
  if (planned.prelude.length === 0 && planned.completion.kind === "value")
    return csharpPlannedArgumentSyntax(planned, planned.completion.expression);
  const returnType = csharpTypeFromTargetTypeRef(expectedCarrier ?? planned.completion.carrier, input.scope.typeParameterNames);
  if (planned.completion.kind === "void" || returnType === undefined || planned.passing !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A sequenced native base argument requires its exact value result and direct parameter storage contract."));
    return undefined;
  }
  const helperParameters = parameters.map(parameter => ({ name: parameter.name, type: parameter.type,
    passing: parameter.passing ?? "ref" as const }));
  const expression = planCsharpGeneratedMethodCall(node, "base_argument", returnType, helperParameters, {
    kind: "Block", statements: [...planned.prelude, ...(planned.completion.kind === "never" ? [] : [{
      kind: "ReturnStatement" as const, expression: planned.completion.expression,
    }])],
  }, helperParameters.map(parameter => ({ kind: "Argument", passing: parameter.passing,
    expression: { kind: "IdentifierName", name: parameter.name } })), input, diagnostics);
  return expression === undefined ? undefined : { kind: "Argument", expression };
}
