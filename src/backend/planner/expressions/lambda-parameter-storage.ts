import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpLambdaParameter, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpLambdaSignature } from "../../../target-model/types/carriers/delegates.js";
import { planParametersWithPrelude } from "../declarations/callables/parameters.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planLambdaParameterStorage(
  declaration: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  carrier: TargetTypeRef,
): { readonly parameters: readonly CsharpLambdaParameter[]; readonly prelude: readonly CsharpStatement[] } {
  const signature = getCsharpLambdaSignature(carrier);
  if (signature === undefined || signature.parameterPassingModes.some(mode => mode !== "by-value")) {
    return failCsharpPlannerInvariant("An admitted source lambda requires its exact native value-parameter signature.", declaration);
  }
  const planned = planParametersWithPrelude(declaration, sourceFile, input, diagnostics, state, signature);
  return {
    parameters: planned.parameters.map(parameter => ({ kind: "Parameter", name: parameter.name, type: parameter.type })),
    prelude: planned.prelude,
  };
}
