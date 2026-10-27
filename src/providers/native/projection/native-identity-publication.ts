import type { CsharpProviderBindingResolution } from "../../../target-model/metadata/provider-metadata.js";
import type { CsharpTargetBindingFact } from "../../../target-model/types/model.js";
import { snapshotCsharpMetadata } from "../../../target-model/metadata/immutable.js";
import { findUniqueTargetBinding, isCsharpProviderTargetBinding } from "../acquisition/target-binding-index.js";

export type CsharpProviderIdentityPublication<Value> =
  | { readonly kind: "resolved"; readonly value: Value }
  | { readonly kind: "missing"; readonly reason: string }
  | Extract<CsharpProviderBindingResolution, { readonly kind: "rejected" }>;

export function createCsharpProviderIdentityPublication(
  references: readonly CsharpTargetBindingFact[],
  acquire: (reference: CsharpTargetBindingFact) => CsharpProviderBindingResolution,
): <Value>(value: Value) => CsharpProviderIdentityPublication<Value> {
  const referencesById = new Map<string, CsharpTargetBindingFact[]>();
  for (const reference of references) {
    const type = reference.csharpType;
    if (type?.kind !== "target-named") continue;
    const entries = referencesById.get(type.id) ?? [];
    entries.push(reference);
    referencesById.set(type.id, entries);
  }
  const native = new Map<string, CsharpProviderBindingResolution>();
  return <Value>(value: Value): CsharpProviderIdentityPublication<Value> => {
    let failure: Exclude<CsharpProviderIdentityPublication<Value>, { readonly kind: "resolved" }> | undefined;
    const published = snapshotCsharpMetadata(value, undefined, undefined, input => {
      if (!("kind" in input) || input.kind !== "target-named" || !("id" in input) || typeof input.id !== "string") return input;
      const references = referencesById.get(input.id);
      if (references === undefined) return input;
      let selected = native.get(input.id);
      if (selected === undefined) {
        selected = findUniqueTargetBinding(references.map(acquire), input.id);
        native.set(input.id, selected);
      }
      if (selected.kind === "rejected") { failure ??= selected; return input; }
      if (selected.kind === "missing") {
        failure ??= { kind: "missing", reason: "A source provider carrier requires its exact physical binding from the declared native owner." };
        return input;
      }
      if (!isCsharpProviderTargetBinding(selected.binding) || selected.binding.csharpType?.kind !== "target-named") {
        failure ??= { kind: "missing", reason: "A source provider carrier requires its complete named C# native binding and generic parameter permissions." };
        return input;
      }
      return Object.freeze({ ...input, ...selected.binding.csharpType,
        typeArguments: "typeArguments" in input ? input.typeArguments : undefined });
    });
    return failure ?? { kind: "resolved", value: published };
  };
}
