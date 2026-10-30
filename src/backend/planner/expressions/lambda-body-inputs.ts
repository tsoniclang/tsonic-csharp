import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceCallableSourceContract } from "../../../target-model/records/callables/source-callable-contract.js";
import type { CsharpLambdaParameter, CsharpParameter, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateSyntheticParameter, declareCsharpLocalBindingName, type DestructuringPlannerState } from "../bindings/index.js";
import { planCsharpCallableArguments } from "../declarations/callables/parameter-adapters.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../types/target-type-object-shapes.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpLambdaBodyInputs(
  contract: SourceCallableSourceContract,
  parameters: readonly CsharpLambdaParameter[], sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
  entry: (node: Node, parameter: CsharpLambdaParameter) =>
    { readonly parameters: readonly CsharpLambdaParameter[]; readonly prelude: readonly CsharpStatement[] } | undefined,
): { readonly parameters: readonly CsharpLambdaParameter[]; readonly prelude: readonly CsharpStatement[] } {
  const layout = contract.bodyInputs;
  if (layout === undefined) return failCsharpPlannerInvariant("A contextual rest body requires its sealed input layout.", contract.sourceDeclaration);
  const nativeParameters = [...parameters];
  const body = layout.parameters.map(parameter => {
    const node = parameter.sourceParameter;
    const name = input.program.source.ast.name(node);
    const emission = input.program.records.callableParameter.get(node);
    const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, parameter.targetParameter.type, diagnostics, node);
    if (name === undefined || emission === undefined || type === undefined)
      return failCsharpPlannerInvariant("A contextual rest body requires its original binding and native storage.", node);
    const parameterName = emission.binding === "identifier" ? declareCsharpLocalBindingName(name, input, state) : allocateSyntheticParameter(state);
    return { name: parameterName, type,
      ...(parameter.missing === "none" ? {} : { defaultValue: parameter.missing === "null"
        ? { kind: "LiteralExpression" as const, value: null }
        : { kind: "DefaultExpression" as const, type, nullForgiving: true } }),
    };
  });
  const native: CsharpParameter[] = parameters.map(parameter => ({ name: parameter.name,
    type: parameter.type ?? failCsharpPlannerInvariant("A contextual rest body requires each physical native parameter.", contract.sourceDeclaration),
  }));
  const prelude: CsharpStatement[] = [];
  for (const [index, parameter] of layout.parameters.entries()) {
    const adapter = layout.adapters[index];
    if (adapter?.kind === "value") {
      const incoming = parameters[adapter.parameterIndex];
      const planned = incoming === undefined ? undefined
        : entry(parameter.sourceParameter, { ...incoming, name: body[index]!.name });
      if (planned?.parameters.length !== 1)
        return failCsharpPlannerInvariant("A native body input requires its exact scalar parameter entry.", parameter.sourceParameter);
      nativeParameters[adapter.parameterIndex] = planned.parameters[0]!;
      prelude.push(...planned.prelude);
      continue;
    }
    const planned = entry(parameter.sourceParameter, { kind: "Parameter", name: body[index]!.name, type: body[index]!.type });
    if (adapter === undefined || planned?.parameters.length !== 1)
      return failCsharpPlannerInvariant("A contextual rest body requires one admitted scalar entry for each source binding.", parameter.sourceParameter);
    const selected = planCsharpCallableArguments(contract.sourceDeclaration, contract, native, [body[index]!], [adapter], sourceFile, input, diagnostics);
    const incoming = planned.parameters[0]!;
    const value = selected.arguments[0];
    if (incoming.type === undefined || value === undefined)
      return failCsharpPlannerInvariant("A contextual rest body requires its complete native entry expression.", parameter.sourceParameter);
    prelude.push(...selected.statements, { kind: "LocalDeclarationStatement", name: incoming.name, type: incoming.type, initializer: value },
      ...planned.prelude);
  }
  return { parameters: nativeParameters, prelude };
}
