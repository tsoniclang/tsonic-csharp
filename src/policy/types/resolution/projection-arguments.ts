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
import { resolveCsharpOptionalStorage } from "./optional-storage.js";
import { csharpTargetTypeComponents } from "../../../target-model/types/components.js";
import { csharpTypeProjection } from "../../../target-model/types/projections.js";

export function resolveCsharpProjectionArguments(
  scope: CsharpTypeResolutionScope, declaration: Node,
  sources: readonly Type[], arguments_: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
  projections: readonly CsharpProjectedType[] = scope.host.representations.genericProjections?.(declaration) ?? [],
  parameters: readonly (Node | undefined)[] = scope.host.ast.typeParameters(declaration),
): readonly TargetTypeRef[] | undefined {
  if (projections.length === 0) return [];
  if (parameters.some(parameter => parameter === undefined)) return undefined;
  const bound = csharpSourceBindings(parameters as readonly Node[], sources, arguments_, nextState(state));
  if (bound === undefined) return undefined;
  const nativeBindings = new Map((parameters as readonly Node[]).map((parameter, index) => [
    csharpSourceTypeParameterName(parameter, scope.host.ast)!, arguments_[index]!,
  ]));
  const queries = scope.host.semanticsFor(declaration);
  const projectionNames = new Set(projections.map(projection => projection.name));
  const selected = new Map<string, TargetTypeRef>();
  const pending = new Set(projections);
  while (pending.size > 0) {
    let progress = false;
    for (const projection of pending) {
      const contract = projection.csharpProjection;
      const components = [...contract.arguments];
      const visited = new Set<TargetTypeRef>();
      let waiting = false;
      for (let index = 0; index < components.length; index += 1) {
        const component = components[index]!;
        if (visited.has(component)) continue;
        visited.add(component);
        const dependency = csharpTypeProjection(component);
        if (dependency !== undefined && projectionNames.has(dependency.name) && !selected.has(dependency.name)) {
          waiting = true;
          break;
        }
        components.push(...csharpTargetTypeComponents(component));
      }
      if (waiting) continue;
      const targetArguments = contract.arguments.map(argument => substituteTargetTypeParameters(argument, nativeBindings));
      let result: TargetTypeRef | undefined;
      if (contract.kind === "optional") {
        result = resolveCsharpOptionalStorage(contract, targetArguments[0]!);
      } else {
        const sourceArguments = contract.sourceArguments.map((argument, index) => {
          const target = contract.arguments[index];
          const parameterIndex = target?.kind !== "type-parameter" ? -1
            : (parameters as readonly Node[]).findIndex(parameter => csharpSourceTypeParameterName(parameter, scope.host.ast) === target.name);
          return parameterIndex >= 0 ? sources[parameterIndex]!
            : csharpBoundSourceType(argument, queries, bound)?.sourceType ?? argument;
        });
        const application = queries.types.instantiateAlias(contract.declaration, sourceArguments);
        result = application === undefined ? undefined : resolveCsharpConditionalApplication(scope, application, targetArguments, queries, bound);
      }
      if (result === undefined) return undefined;
      selected.set(projection.name, result);
      nativeBindings.set(projection.name, result);
      pending.delete(projection);
      progress = true;
    }
    if (!progress) return undefined;
  }
  return projections.map(projection => selected.get(projection.name)!);
}
