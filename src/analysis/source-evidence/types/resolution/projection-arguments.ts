import type { Node } from "@tsonic/tsts";
import { sourceNodeIdentity, sourceTypeDescriptorSum, sourceTypeDescriptorsEqual, type SourceClosedSum, type SourceEffectiveTypeArgument, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpProjectedType, CsharpSourceSumSelection } from "../../../../target-model/types/projections.js";
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
import { substituteSourceTypeDescriptor } from "@tsonic/target-api/source";
import { csharpProjectedType } from "../../../../target-model/types/projections.js";
import { csharpFreeTypeParameterIdentities } from "../../../../target-model/types/generic-references.js";
import { resolveCsharpSourceUnionOperations } from "../../../../policy/types/storage/source-union-storage.js";
import { csharpPublishedSourceReferences } from "./type-bindings.js";
import { csharpJsCollectionKeyTargetType } from "../../../../target-model/types/carriers/js.js";

export interface CsharpPublishedProjectionInput {
  readonly bindings: readonly SourceEffectiveTypeArgument[];
  readonly definitions: readonly SourceTypeDescriptor[];
}

const sourceSumOwners = new WeakMap<object, object>();

function publishedOpenSourceSum(scope: CsharpTypeResolutionScope, descriptor: SourceTypeDescriptor, family: Node):
    SourceClosedSum | undefined {
  const pending = [descriptor];
  const visited = new Set<SourceTypeDescriptor>();
  const records = new Set<SourceClosedSum>();
  for (let index = 0; index < pending.length; index++) {
    const selected = pending[index]!;
    if (visited.has(selected)) continue;
    visited.add(selected);
    const record = sourceTypeDescriptorSum(scope.host.ast, selected);
    if (record?.identity.family === family && scope.host.effectiveTypes.sum(record.identity) === record &&
      record.identity.application.every(argument => argument.kind === "declared" &&
        argument.typeArguments.length === 0 && scope.host.ast.is.IsTypeParameterDeclaration(argument.declaration))) records.add(record);
    switch (selected.kind) {
      case "declared":
        pending.push(...selected.typeArguments);
        if (selected.definition !== undefined) pending.push(selected.definition);
        break;
      case "union": pending.push(...selected.types); break;
      case "optional": pending.push(selected.value); break;
      case "array": pending.push(selected.element); break;
      case "tuple": pending.push(...selected.elements.map(element => element.type)); break;
      case "shape":
        pending.push(...selected.members.map(member => member.type),
          ...selected.indexes.flatMap(member => [member.key, member.value]));
        pending.push(...[...selected.calls, ...selected.constructs].flatMap(signature =>
          [...signature.parameters.map(parameter => parameter.type), signature.result]));
        break;
      case "callable":
        pending.push(...[...selected.calls, ...selected.constructs].flatMap(signature =>
          [...signature.parameters.map(parameter => parameter.type), signature.result]));
        break;
    }
  }
  return records.size === 1 ? records.values().next().value : undefined;
}

export function resolveCsharpPublishedSourceSum(
  scope: CsharpTypeResolutionScope,
  descriptor: SourceTypeDescriptor,
): CsharpSourceSumSelection | undefined {
  const { host } = scope;
  let owner = sourceSumOwners.get(host.effectiveTypes);
  if (owner === undefined) {
    owner = Object.freeze({});
    sourceSumOwners.set(host.effectiveTypes, owner);
  }
  const record = sourceTypeDescriptorSum(host.ast, descriptor);
  if (record === undefined || host.effectiveTypes.sum(record.identity) !== record) return undefined;
  const original = host.effectiveTypes.get(record.identity.family);
  if (original === undefined || original.kind === "refused") return undefined;
  const open = publishedOpenSourceSum(scope, original.construction ?? original.type, record.identity.family);
  if (open === undefined || open.identity.family !== record.identity.family ||
    host.effectiveTypes.sum(open.identity) !== open || open.identity.application.length !== record.identity.application.length ||
    open.arms.length !== open.roles.length) return undefined;
  const bindings = new Map<Node, SourceTypeDescriptor>();
  for (let index = 0; index < open.identity.application.length; index++) {
    const parameter = open.identity.application[index]!;
    if (parameter.kind !== "declared" || parameter.typeArguments.length !== 0 ||
      !host.ast.is.IsTypeParameterDeclaration(parameter.declaration) || bindings.has(parameter.declaration)) return undefined;
    bindings.set(parameter.declaration, record.identity.application[index]!);
  }
  const roles: CsharpSourceSumSelection["roles"][number][] = [];
  for (let index = 0; index < open.roles.length; index++) {
    const role = open.roles[index];
    const arm = role?.arms.length === 1 ? open.arms[role.arms[0]!] : undefined;
    if (arm === undefined || role?.role !== index || arm.role !== role.role ||
      record.roles[index]?.role !== index) return undefined;
    const type = record === open ? arm.type : substituteSourceTypeDescriptor(host.ast, arm.type, bindings);
    if (type === undefined) return undefined;
    roles.push(Object.freeze({ role: index, type }));
  }
  const namingIdentity = sourceNodeIdentity(host.ast, record.identity.family);
  return namingIdentity === undefined ? undefined : Object.freeze({ owner, record, namingIdentity, roles: Object.freeze(roles) });
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
  const sourceBindings = new Map<Node, SourceTypeDescriptor>();
  for (const [parameter, binding] of state.sourceBindings ?? []) if (binding.descriptor !== undefined)
    sourceBindings.set(parameter, binding.descriptor);
  for (const binding of publication.bindings) {
    const previous = sourceBindings.get(binding.declaration);
    if (previous !== undefined && !sourceTypeDescriptorsEqual(previous, binding.type)) return undefined;
    sourceBindings.set(binding.declaration, binding.type);
  }
  const definitions = csharpPublishedSourceReferences([...publication.definitions, ...publication.bindings.map(binding => binding.type)]);
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
      } else if (contract.kind === "collection-key") {
        result = csharpJsCollectionKeyTargetType(targetArguments[0]!);
      } else if (contract.kind === "source-union") {
        if (scope.host.effectiveTypes.sum(contract.sum.record.identity) !== contract.sum.record) return undefined;
        const retained = csharpPublishedSourceReferences([contract.source, ...contract.sum.roles.map(role => role.type),
          ...contract.sum.record.identity.application]);
        if (retained.some(reference => reference.typeArguments.length === 0 &&
          scope.host.ast.is.IsTypeParameterDeclaration(reference.declaration) &&
          nativeBindings.has(csharpSourceTypeParameter(reference.declaration, scope.host.ast)?.identity ?? "") &&
          !sourceBindings.has(reference.declaration))) return undefined;
        const source = substituteSourceTypeDescriptor(scope.host.ast, contract.source, sourceBindings);
        const roles = contract.sum.roles.map(role => substituteSourceTypeDescriptor(scope.host.ast, role.type, sourceBindings));
        const application = contract.sum.record.identity.application.map(argument =>
          substituteSourceTypeDescriptor(scope.host.ast, argument, sourceBindings));
        if (source === undefined || roles.some(role => role === undefined) || application.some(argument => argument === undefined)) return undefined;
        const record = scope.host.effectiveTypes.sum({ family: contract.sum.record.identity.family,
          application: application as readonly SourceTypeDescriptor[] });
        if (record === undefined || contract.sum.roles.some(role => record.roles[role.role]?.role !== role.role)) return undefined;
        const sum: CsharpSourceSumSelection = Object.freeze({ owner: contract.sum.owner, record, namingIdentity: contract.sum.namingIdentity,
          roles: Object.freeze(contract.sum.roles.map((role, index) => Object.freeze({ role: role.role, type: roles[index]! }))) });
        const storage = resolveCsharpSourceTypeDescriptor(scope, source, nextState(state), declaration);
        const nativeRoles = roles.map(role => resolveCsharpSourceTypeDescriptor(scope, role!, nextState(state), declaration));
        if (storage === undefined || nativeRoles.some(role => role === undefined)) return undefined;
        result = contract.part === "storage" ? storage
          : csharpFreeTypeParameterIdentities([storage, ...nativeRoles as readonly TargetTypeRef[]]).size !== 0
            ? csharpProjectedType({ ...contract, source, sum,
              arguments: [storage, ...nativeRoles as readonly TargetTypeRef[]] })
            : (() => {
              const arms = record.arms.map(arm => resolveCsharpSourceTypeDescriptor(scope, arm.type, nextState(state), declaration));
              return arms.some(arm => arm === undefined) ? undefined : resolveCsharpSourceUnionOperations(storage,
                nativeRoles as readonly TargetTypeRef[], { record, arms: arms as readonly TargetTypeRef[] }, sum.roles.map(role => role.role));
            })();
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

