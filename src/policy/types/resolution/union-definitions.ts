import { createHash } from "node:crypto";
import type { Type } from "@tsonic/tsts";
import { sourceNodeIdentity, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypePolicyHost, CsharpTypeResolutionState, CsharpRecursiveTypeResolver } from "./model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourceUnionTargetType } from "../../../target-model/types/source-union-definitions.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import { nextState } from "./state.js";

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
  return Object.freeze({
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
      construct: () => { readonly carrier: TargetTypeRef | undefined; readonly arms: readonly TargetTypeRef[] }) {
      const cached = selected.get(type);
      if (cached !== undefined) return cached.result;
      const application = queries.types.aliasApplication(type);
      const identity = application === undefined ? undefined : sourceNodeIdentity(host.ast, application.declaration);
      if (application?.kind !== "direct" || identity === undefined || host.typeDefinitions === undefined ||
        !host.navigation.isProjectDeclaration(application.declaration)) return construct().carrier;
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
      const parameterNodes = new Set(host.ast.typeParameters(application.declaration));
      const templateState = { ...nextState(state), sourceBindings: new Map(
        [...state.sourceBindings ?? []].filter(([node]) => !parameterNodes.has(node)),
      ) };
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
      const resolved = construct();
      definition.building = false;
      const present = getCsharpNullableElementTargetType(resolved.carrier) ?? resolved.carrier;
      const arms = present === undefined ? [] : getCsharpRuntimeUnionArms(present) ?? [present];
      definition.result = host.typeDefinitions.sourceUnionArms(carrier) !== undefined
        ? resolved.carrier === undefined ? undefined : definition.reference
        : !definition.recursive ? resolved.carrier
        : resolved.carrier !== undefined && host.typeDefinitions.registerSourceUnion({ carrier, arms })
          ? definition.reference : undefined;
      return definition.result;
    },
  });
}
