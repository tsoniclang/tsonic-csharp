import type { Node, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectedType } from "../../../target-model/types/projections.js";
import { csharpSourceTypeParameterName } from "../../../target-model/names/type-parameters.js";
import { substituteTargetTypeParameters } from "../callables/substitution.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpBoundSourceType, csharpSourceBindings } from "./type-bindings.js";
import { resolveCsharpConditionalApplication } from "./conditional-types.js";
import { nextState } from "./state.js";

export function resolveCsharpProjectionArguments(
  scope: CsharpTypeResolutionScope, declaration: Node,
  sources: readonly Type[], arguments_: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
  projections: readonly CsharpProjectedType[] = scope.host.representations.genericProjections?.(declaration) ?? [],
): readonly TargetTypeRef[] | undefined {
  if (projections.length === 0) return [];
  const parameters = scope.host.ast.typeParameters(declaration);
  if (parameters.some(parameter => parameter === undefined)) return undefined;
  const bound = csharpSourceBindings(parameters as readonly Node[], sources, arguments_, nextState(state));
  if (bound === undefined) return undefined;
  const nativeBindings = new Map((parameters as readonly Node[]).map((parameter, index) => [
    csharpSourceTypeParameterName(parameter, scope.host.ast)!, arguments_[index]!,
  ]));
  const queries = scope.host.semanticsFor(declaration);
  const results = projections.map(projection => {
    const contract = projection.csharpProjection;
    const sourceArguments = contract.sourceArguments.map((argument, index) => {
      const target = contract.arguments[index];
      const parameterIndex = target?.kind !== "type-parameter" ? -1
        : (parameters as readonly Node[]).findIndex(parameter => csharpSourceTypeParameterName(parameter, scope.host.ast) === target.name);
      return parameterIndex >= 0 ? sources[parameterIndex]!
        : csharpBoundSourceType(argument, queries, bound)?.sourceType ?? argument;
    });
    const targetArguments = contract.arguments.map(argument => substituteTargetTypeParameters(argument, nativeBindings));
    const application = queries.types.instantiateAlias(contract.declaration, sourceArguments);
    return application === undefined ? undefined : resolveCsharpConditionalApplication(scope, application, targetArguments, queries, bound);
  });
  return results.some(result => result === undefined) ? undefined : results as readonly TargetTypeRef[];
}
