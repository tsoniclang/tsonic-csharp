import type { TargetBindingFact, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { csharpSourceUnionIdentity, instantiateCsharpSourceUnionArms,
  snapshotCsharpSourceUnionDefinition,
  type CsharpSourceUnionDefinition, type CsharpTypeDefinitions,
  type CsharpTypeDefinitionWriter } from "../../target-model/types/source-union-definitions.js";

export interface CsharpTypeDefinitionRegistry extends CsharpTypeDefinitionWriter {
  seal(): CsharpTypeDefinitions;
}

export function createCsharpTypeDefinitionRegistry(
  nativeBinding: (id: string) => TargetBindingFact | undefined = () => undefined,
): CsharpTypeDefinitionRegistry {
  const definitions = new Map<string, CsharpSourceUnionDefinition>();
  const nativeKinds = new Map<string, TargetBindingFact["kind"] | undefined>();
  let sealed = false;
  const nativeDeclarationKind: CsharpTypeDefinitions["nativeDeclarationKind"] = carrier => {
    if (carrier.kind !== "target-named") return undefined;
    if (nativeKinds.has(carrier.id)) return nativeKinds.get(carrier.id);
    if (sealed) return undefined;
    if (nativeKinds.size >= 1_048_576) throw new Error("C# native type definitions exceed their resource bound.");
    const binding = nativeBinding(carrier.id);
    const kind = binding?.target === "csharp" && binding.id === carrier.id ? binding.kind : undefined;
    nativeKinds.set(carrier.id, kind);
    return kind;
  };
  const sourceUnionArms: CsharpTypeDefinitions["sourceUnionArms"] = carrier => {
    const identity = csharpSourceUnionIdentity(carrier);
    const definition = identity === undefined ? undefined : definitions.get(identity);
    return definition === undefined ? undefined : instantiateCsharpSourceUnionArms(definition, carrier);
  };
  const sourceUnions = (): readonly CsharpSourceUnionDefinition[] => Object.freeze([...definitions.values()]);
  return Object.freeze({
    nativeDeclarationKind,
    sourceUnionArms,
    sourceUnions,
    registerSourceUnion(definition: CsharpSourceUnionDefinition) {
      if (sealed) throw new Error("C# type definitions are sealed.");
      try {
        definition = snapshotCsharpSourceUnionDefinition(definition);
      } catch (error) {
        if (error instanceof TypeError) return false;
        throw error;
      }
      const identity = csharpSourceUnionIdentity(definition.carrier);
      if (identity === undefined ||
        new Set(definition.arms.map(targetTypeRefKey)).size !== definition.arms.length) return false;
      const existing = definitions.get(identity);
      if (existing !== undefined) {
        const expected = instantiateCsharpSourceUnionArms(existing, definition.carrier);
        return expected !== undefined && expected.length === definition.arms.length &&
          expected.every((arm, index) => targetTypeRefEquals(arm, definition.arms[index]!));
      }
      const parameters = definition.carrier.typeArguments ?? [];
      if (definitions.size >= 1_048_576 || parameters.some(parameter => parameter.kind !== "type-parameter") ||
        new Set(parameters.map(targetTypeRefKey)).size !== parameters.length) return false;
      definitions.set(identity, Object.freeze(definition));
      return true;
    },
    seal() {
      const visited = new Set<string>();
      const visit = (carrier: TargetTypeRef): void => {
        const key = targetTypeRefKey(carrier);
        if (visited.has(key)) return;
        visited.add(key);
        if (csharpSourceUnionIdentity(carrier) !== undefined && sourceUnionArms(carrier) === undefined) {
          throw new Error("A C# source union references an undefined or incompatible arm contract.");
        }
        for (const child of csharpTargetTypeComponents(carrier)) visit(child);
      };
      for (const definition of definitions.values()) for (const arm of definition.arms) visit(arm);
      sealed = true;
      return Object.freeze({ nativeDeclarationKind, sourceUnionArms, sourceUnions });
    },
  });
}
