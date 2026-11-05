import type { Node } from "@tsonic/tsts";
import type { SourceEffectiveTypeArgument, SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpProjectedType } from "../../../../target-model/types/projections.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { resolveCsharpSourceTypeDescriptor } from "./effective-types.js";
import { nextState } from "./state.js";
import { resolveCsharpOptionalStorage } from "../../../../policy/types/storage/optional-storage.js";
import { csharpTargetTypeComponents } from "../../../../target-model/types/components.js";
import { csharpTypeProjection } from "../../../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

export interface CsharpPublishedProjectionInput {
  readonly bindings: readonly SourceEffectiveTypeArgument[];
  readonly definitions: readonly SourceTypeDescriptor[];
}

export function resolveCsharpProjectionArguments(
  scope: CsharpTypeResolutionScope, declaration: Node,
  publication: CsharpPublishedProjectionInput, arguments_: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
  projections: readonly CsharpProjectedType[] = scope.host.representations.genericProjections(declaration),
  parameters: readonly (Node | undefined)[] = scope.host.ast.typeParameters(declaration),
): readonly TargetTypeRef[] | undefined {
  if (!Array.isArray(publication.bindings) || !Array.isArray(publication.definitions)) return undefined;
  if (projections.length === 0) return [];
  if (parameters.some(parameter => parameter === undefined) || parameters.length !== arguments_.length ||
    publication.bindings.length !== parameters.length || new Set(parameters).size !== parameters.length ||
    publication.bindings.some((binding, index) => binding.declaration !== parameters[index])) return undefined;
  const nativeParameters = (parameters as readonly Node[]).map(parameter => csharpSourceTypeParameter(parameter, scope.host.ast));
  if (nativeParameters.some(parameter => parameter === undefined) ||
    new Set(nativeParameters.map(parameter => parameter!.identity)).size !== parameters.length) return undefined;
  const nativeBindings = new Map<string, TargetTypeRef>();
  for (const [declaration, binding] of state.sourceBindings ?? []) {
    const parameter = csharpSourceTypeParameter(declaration, scope.host.ast);
    if (parameter !== undefined) nativeBindings.set(parameter.identity, binding.targetType);
  }
  nativeParameters.forEach((parameter, index) => nativeBindings.set(parameter!.identity, arguments_[index]!));
  const definitions = publishedReferences([...publication.definitions, ...publication.bindings.map(binding => binding.type)]);
  const projectionIdentities = new Set(projections.map(projection => projection.identity));
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
        if (dependency !== undefined && projectionIdentities.has(dependency.identity) && !selected.has(dependency.identity)) {
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
        const matches: TargetTypeRef[] = [];
        for (const reference of definitions) {
          if (reference.declaration !== contract.declaration || reference.definition === undefined ||
            reference.typeArguments.length !== targetArguments.length) continue;
          const representedArguments = reference.typeArguments.map(argument =>
            resolveCsharpSourceTypeDescriptor(scope, argument, nextState(state), declaration));
          if (representedArguments.some((argument, index) => argument === undefined ||
            !targetTypeRefEquals(substituteTargetTypeParameters(argument, nativeBindings), targetArguments[index]!))) continue;
          const selected = resolveCsharpSourceTypeDescriptor(scope, reference, nextState(state), declaration);
          if (selected === undefined) return undefined;
          matches.push(substituteTargetTypeParameters(selected, nativeBindings));
        }
        const first = matches[0];
        result = first === undefined || matches.some(selected => !targetTypeRefEquals(selected, first)) ? undefined : first;
      }
      if (result === undefined) return undefined;
      selected.set(projection.identity, result);
      nativeBindings.set(projection.identity, result);
      pending.delete(projection);
      progress = true;
    }
    if (!progress) return undefined;
  }
  return projections.map(projection => selected.get(projection.identity)!);
}

function publishedReferences(roots: readonly SourceTypeDescriptor[]): readonly Extract<SourceTypeDescriptor, { readonly kind: "declared" }>[] {
  const pending = [...roots];
  const visited = new Set<SourceTypeDescriptor>();
  const references: Extract<SourceTypeDescriptor, { readonly kind: "declared" }>[] = [];
  for (let index = 0; index < pending.length; index += 1) {
    const descriptor = pending[index]!;
    if (visited.has(descriptor)) continue;
    visited.add(descriptor);
    switch (descriptor.kind) {
      case "declared":
        references.push(descriptor);
        pending.push(...descriptor.typeArguments);
        if (descriptor.definition !== undefined) pending.push(descriptor.definition);
        break;
      case "union": pending.push(...descriptor.types); break;
      case "array": pending.push(descriptor.element); break;
      case "optional": pending.push(descriptor.value); break;
      case "tuple": pending.push(...descriptor.elements.map(element => element.type)); break;
      case "shape":
        pending.push(...descriptor.members.map(member => member.type),
          ...descriptor.indexes.flatMap(selected => [selected.key, selected.value]));
        pending.push(...[...descriptor.calls, ...descriptor.constructs].flatMap(signature =>
          [...signature.parameters.map(parameter => parameter.type), signature.result]));
        break;
      case "callable":
        pending.push(...[...descriptor.calls, ...descriptor.constructs].flatMap(signature =>
          [...signature.parameters.map(parameter => parameter.type), signature.result]));
        break;
    }
  }
  return references;
}
