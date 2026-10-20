import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpParameter } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpPlannedArgument } from "../../expressions/planned-values.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { planCsharpGeneratedMethodCall } from "../generated-methods.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import { csharpPlannedArgumentSyntax } from "../../expressions/target-members/selected-call/planned-arguments.js";

export function planCsharpConstructorInitializerArgument(
  node: Node, planned: CsharpPlannedArgument, parameters: readonly CsharpParameter[],
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], _expectedCarrier?: TargetTypeRef,
): CsharpArgument | undefined {
  const selected = input.program.records.constructorArgument.get(node);
  if (selected === undefined || selected.kind === "packet") failCsharpPlannerInvariant("An admitted direct base argument requires its native initializer transport.", node);
  if (selected.kind === "direct") {
    if (planned.completion.kind !== "value" || planned.prelude.length !== 0) failCsharpPlannerInvariant("A direct base argument lost its admitted inline native completion.", node);
    return csharpPlannedArgumentSyntax(planned, planned.completion.expression);
  }
  const returnType = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames);
  if (planned.completion.kind === "void" || returnType === undefined || planned.passing !== undefined)
    failCsharpPlannerInvariant("An admitted sequenced base argument lost its exact native value transport.", node);
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
