import { createHash } from "node:crypto";
import type { Node, Type } from "@tsonic/tsts";
import { sourceNodeIdentity, type SourceFileSemantics, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpTypePolicyHost, CsharpTypeResolutionState, CsharpRecursiveTypeResolver } from "./model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceUnionTargetType } from "../../../../target-model/types/source-union-definitions.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { nextState } from "./state.js";
import { csharpSourceTemplateState } from "./type-bindings.js";

interface Definition {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly reference: TargetTypeRef;
  recursive: boolean;
  building: boolean;
  result?: TargetTypeRef;
}

interface PublishedApplication {
  readonly definitions: WeakMap<SourceTypeDescriptor, Definition>;
  readonly pending: Set<Definition>;
  cut: { readonly kind: "unseen" | "ambiguous" } | { readonly kind: "recursive"; readonly reference: TargetTypeRef };
}

export function createCsharpSourceUnionDefinitions(
  host: CsharpTypePolicyHost,
  resolveType: CsharpRecursiveTypeResolver["resolveType"],
) {
  const selected = new WeakMap<Type, Definition>();
  const published = new Map<string, PublishedApplication>();
  return Object.freeze({
    // absent: the published alias definition carries absence (T = U | undefined), so a recursive occurrence of the
    // alias is the nullable carrier, exactly as the checked-type path below records for a nullish alias union.
    resolveDescriptor(declaration: Node, typeArguments: readonly TargetTypeRef[],
      definition: SourceTypeDescriptor | undefined,
      materialize: (definition: SourceTypeDescriptor) => TargetTypeRef | undefined, absent = false): TargetTypeRef | undefined {
      const identity = sourceNodeIdentity(host.ast, declaration);
      if (identity === undefined) return undefined;
      const key = JSON.stringify([identity, typeArguments.map(targetTypeRefKey)]);
      let application = published.get(key);
      if (definition === undefined) {
        if (application === undefined) return undefined;
        if (application.pending.size === 0) return application.cut.kind === "recursive" ? application.cut.reference : undefined;
        if (application.pending.size !== 1) return undefined;
        const pending = application.pending.values().next().value;
        if (pending === undefined) return undefined;
        pending.recursive = true;
        return pending.reference;
      }
      const previous = application?.definitions.get(definition);
      if (previous !== undefined) {
        if (previous.building) previous.recursive = true;
        return previous.building ? previous.reference : previous.result;
      }
      if (application === undefined) {
        application = { definitions: new WeakMap<SourceTypeDescriptor, Definition>(), pending: new Set<Definition>(),
          cut: { kind: "unseen" } };
        published.set(key, application);
      }
      const name = `__TsonicUnion_${createHash("sha256").update(identity).digest("hex")}`;
      const carrier = csharpSourceUnionTargetType(identity, name, typeArguments);
      const record: Definition = { carrier, reference: absent ? csharpNullableTargetType(carrier) : carrier, recursive: false, building: true };
      application.definitions.set(definition, record);
      application.pending.add(record);
      try {
        const result = materialize(definition);
        const present = getCsharpNullableElementTargetType(result) ?? result;
        const arms = present === undefined ? [] : getCsharpRuntimeUnionArms(present, host.typeDefinitions) ?? [present];
        record.result = !record.recursive ? result : result !== undefined && host.typeDefinitions !== undefined &&
          host.typeDefinitions.registerSourceUnion({ carrier, arms })
            ? getCsharpNullableElementTargetType(result) === undefined ? carrier : csharpNullableTargetType(carrier) : undefined;
        return record.result;
      } finally {
        record.building = false;
        application.pending.delete(record);
        if (!record.recursive || record.result === undefined || application.cut.kind === "ambiguous" ||
          application.cut.kind === "recursive" && !targetTypeRefEquals(application.cut.reference, record.result)) {
          application.cut = { kind: "ambiguous" };
        } else {
          application.cut = { kind: "recursive", reference: record.result };
        }
      }
    },
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
      if (cached !== undefined) {
        if (cached.building) cached.recursive = true;
        return cached.building ? cached.reference : cached.result;
      }
      const application = queries.types.aliasApplication(type);
      const identity = application === undefined ? undefined : sourceNodeIdentity(host.ast, application.declaration);
      if (application?.kind !== "direct" || identity === undefined || host.typeDefinitions === undefined ||
        !host.navigation.isProjectDeclaration(application.declaration)) return construct().carrier;
      const arguments_ = application.bindings.map(binding => resolveType(binding.argument, queries.sourceFile, nextState(state)));
      if (arguments_.some(argument => argument === undefined)) return undefined;
      const typeArguments = arguments_ as readonly TargetTypeRef[];
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
      selected.set(type, definition);
      try {
        const resolved = construct();
        const present = getCsharpNullableElementTargetType(resolved.carrier) ?? resolved.carrier;
        const arms = present === undefined ? [] : getCsharpRuntimeUnionArms(present) ?? [present];
        definition.result = host.typeDefinitions.sourceUnionArms(carrier) !== undefined
          ? resolved.carrier === undefined ? undefined : definition.reference
          : !definition.recursive ? resolved.carrier
          : resolved.carrier !== undefined && host.typeDefinitions.registerSourceUnion({ carrier, arms })
            ? definition.reference : undefined;
        return definition.result;
      } finally {
        definition.building = false;
      }
    },
  });
}
