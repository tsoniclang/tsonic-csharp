import { createHash } from "node:crypto";
import type { Type } from "@tsonic/tsts";
import { sourceNodeIdentity, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypePolicyHost, CsharpTypeResolutionState, CsharpRecursiveTypeResolver } from "./model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceUnionTargetType } from "../../../../target-model/types/source-union-definitions.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { combineCsharpTargetUnionMembers, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpUnionReferenceImplicitlyAccepts } from "../../../../policy/conversions/carriers.js";
import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import { csharpUnionLeaves } from "../../../../target-model/types/union-relations.js";
import { nextState } from "./state.js";
import { csharpSourceTemplateState } from "./type-bindings.js";

interface Definition {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly reference: TargetTypeRef;
  recursive: boolean;
  building: boolean;
  result?: TargetTypeRef;
}

export function createCsharpSourceUnionDefinitions(
  host: CsharpTypePolicyHost,
  resolveType: CsharpRecursiveTypeResolver["resolveType"],
) {
  const selected = new WeakMap<Type, Definition>();
  const definitions = new Map<string, Definition>();
  const accepts = (source: TargetTypeRef, target: TargetTypeRef): boolean => csharpUnionReferenceImplicitlyAccepts({
    typeDefinitions: host.typeDefinitions, projectTypes: host.projectTypes(), providers: host.providers,
    objectShapes: host.objectShapes,
  }, source, target);
  const physicalArm = (source: TargetTypeRef, carrier: TargetTypeRef): TargetTypeRef | undefined => {
    const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
    const arms = csharpUnionLeaves(present, host.typeDefinitions)?.map(leaf => leaf.carrier) ?? [present];
    const exact = arms.find(arm => targetTypeRefEquals(source, arm));
    if (exact !== undefined) return exact;
    const targets = arms.filter(arm => accepts(source, arm) && !accepts(arm, source));
    const maximal = targets.filter(arm => !targets.some(other =>
      !targetTypeRefEquals(arm, other) && accepts(arm, other) && !accepts(other, arm)));
    return maximal.length === 1 ? maximal[0] : undefined;
  };
  const combine = (arms: readonly TargetTypeRef[] | undefined): TargetTypeRef | undefined => {
    if (arms === undefined) return undefined;
    const combined = combineCsharpTargetUnionMembers(arms);
    if (combined === undefined) return undefined;
    const present = getCsharpNullableElementTargetType(combined) ?? combined;
    const members = getCsharpRuntimeUnionArms(present) ?? [present];
    const retained = members.filter(member => {
      const alternatives = members.filter(other => !targetTypeRefEquals(member, other));
      if (alternatives.length === 0) return true;
      const carrier = combineCsharpTargetUnionMembers(alternatives);
      return carrier === undefined || physicalArm(member, carrier) === undefined;
    });
    const result = combineCsharpTargetUnionMembers(retained);
    const nullable = getCsharpNullableElementTargetType(combined) !== undefined;
    return retainCsharpUnionObjectShapes(result === undefined || !nullable || isCsharpAbsenceTargetType(result)
      ? result : csharpNullableTargetType(result), host.structuralTypes.resolveTarget);
  };
  return Object.freeze({
    physicalArm,
    reference(type: Type): TargetTypeRef | undefined {
      const definition = selected.get(type);
      if (definition === undefined) return undefined;
      if (definition.building) {
        definition.recursive = true;
        return definition.reference;
      }
      return definition.result;
    },
    resolve(type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
      construct: () => readonly TargetTypeRef[] | undefined) {
      const cached = selected.get(type);
      if (cached !== undefined) return cached.result;
      const application = queries.types.aliasApplication(type);
      const identity = application === undefined ? undefined : sourceNodeIdentity(host.ast, application.declaration);
      if (application?.kind !== "direct" || identity === undefined || host.typeDefinitions === undefined ||
        !host.navigation.isProjectDeclaration(application.declaration)) return combine(construct());
      const arguments_ = application.bindings.map(binding => resolveType(binding.argument, queries.sourceFile, nextState(state)));
      if (arguments_.some(argument => argument === undefined)) return undefined;
      const typeArguments = arguments_ as readonly TargetTypeRef[];
      const key = JSON.stringify([identity, typeArguments.map(targetTypeRefKey)]);
      const previous = definitions.get(key);
      if (previous !== undefined) {
        selected.set(type, previous);
        if (previous.building) previous.recursive = true;
        return previous.building ? previous.reference : previous.result;
      }
      const name = `__TsonicUnion_${createHash("sha256").update(identity).digest("hex")}`;
      const carrier = csharpSourceUnionTargetType(identity, name, typeArguments);
      const templateState = csharpSourceTemplateState(host.ast.typeParameters(application.declaration), nextState(state));
      const parameters = application.bindings.map(binding => resolveType(binding.parameter, queries.sourceFile, templateState));
      if (parameters.some(parameter => parameter?.kind !== "type-parameter")) return undefined;
      if (parameters.some((parameter, index) => !targetTypeRefEquals(parameter!, typeArguments[index]!)) &&
        host.typeDefinitions.sourceUnionArms(carrier) === undefined) {
        const declared = queries.declarations.declaredType(application.declaration);
        if (declared === undefined || declared === type || resolveType(declared, queries.sourceFile, templateState) === undefined) return undefined;
      }
      const absent = queries.types.unionOrIntersectionTypes(type).some(member => queries.types.isNullish(member));
      const definition: Definition = { carrier, reference: absent ? csharpNullableTargetType(carrier) : carrier,
        recursive: false, building: true };
      definitions.set(key, definition);
      selected.set(type, definition);
      const resolved = combine(construct());
      definition.building = false;
      const present = getCsharpNullableElementTargetType(resolved) ?? resolved;
      const arms = present === undefined ? [] : getCsharpRuntimeUnionArms(present) ?? [present];
      definition.result = host.typeDefinitions.sourceUnionArms(carrier) !== undefined
        ? resolved === undefined ? undefined : definition.reference
        : !definition.recursive ? resolved
        : resolved !== undefined && host.typeDefinitions.registerSourceUnion({ carrier, arms })
          ? definition.reference : undefined;
      return definition.result;
    },
  });
}
