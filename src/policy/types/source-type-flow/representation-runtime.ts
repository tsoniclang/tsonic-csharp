import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef, CsharpNativeGenericTypeDefinition, CsharpRepresentedTypeParameter, CsharpTypeParameterConstraint } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { nativeRepresentationFailure, represented } from "./representation-results.js";
import { createHash } from "node:crypto";
import type { SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { applyCsharpNativeGenericType } from "../../../target-model/types/native-generics.js";
import { snapshotCsharpTargetTypes } from "../../../target-model/types/snapshot.js";

export function sourceNativeType(host: Pick<CsharpRepresentationHost, "providers" | "acquireNativeDeclaration">, metadataName: string,
  arguments_: readonly TargetTypeRef[], kind: "struct" | "interface", site: Node): Exclude<CsharpRepresentationOutcome<TargetTypeRef>, { readonly kind: "source-refused" }> {
  const definition = sourceNativeGenericDefinition(host, metadataName, arguments_.length, kind, site);
  return definition.kind === "represented" ? represented(applyCsharpNativeGenericType(definition.value, arguments_)) : definition;
}

export function sourceNativeGenericDefinition(host: Pick<CsharpRepresentationHost, "providers" | "acquireNativeDeclaration">, metadataName: string,
  arity: number, kind: "struct" | "interface" | "class", site: Node): Exclude<CsharpRepresentationOutcome<CsharpNativeGenericTypeDefinition>, { readonly kind: "source-refused" }> {
  const selected = host.providers.findTargetBindingByMetadataName(metadataName, "ordinary");
  if (selected.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: selected.diagnostic });
  if (selected.kind === "missing") return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
    `The Native helper '${metadataName}' requires its actual acquired target binding.`);
  const binding = selected.binding;
  if (binding.target !== "csharp" || binding.kind !== kind || (binding.typeParameters?.length ?? 0) !== arity) {
    return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
      `The Native helper '${metadataName}' does not have the required declaration kind and exact ordered binder arity.`);
  }
  const acquired = host.acquireNativeDeclaration(binding.id);
  if (acquired.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: acquired.diagnostic });
  if (acquired.kind === "missing") return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
    `The Native helper '${metadataName}' requires its complete original Native declaration.`);
  const { carrier: type, parameters } = acquired.definition;
  if (type.kind !== "target-named" || type.id !== binding.id || acquired.definition.kind !== kind ||
    parameters.length !== arity || new Set(parameters.map(parameter => parameter.identity)).size !== arity ||
    parameters.some((parameter, index) => parameter.identity !== binding.typeParameters?.[index]?.identity)) {
    return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
      `The Native helper '${metadataName}' has no acquired named physical template and original ordered binder vector.`);
  }
  const carrier = snapshotCsharpTargetTypes([type])[0]!;
  if (carrier.kind !== "target-named") throw new TypeError("A snapshotted Native helper definition must retain its acquired named kind.");
  return represented(Object.freeze({ carrier, parameters: Object.freeze(parameters.map(parameter => parameter.identity)) }));
}

export function sourceRuntimeType(host: Pick<CsharpRepresentationHost, "providers" | "acquireNativeDeclaration">, name: string,
  arguments_: readonly TargetTypeRef[], kind: "struct" | "interface", site: Node): Exclude<CsharpRepresentationOutcome<TargetTypeRef>, { readonly kind: "source-refused" }> {
  return sourceNativeType(host, `Tsonic.CSharp.Runtime.${name}${arguments_.length === 0 ? "" : `\`${arguments_.length}`}`,
    arguments_, kind, site);
}

export function sourceRepresentationParameter(
  identity: string,
  prefix: string,
  constraints: readonly CsharpTypeParameterConstraint[],
  dependencies: readonly TargetTypeRef[],
): CsharpRepresentedTypeParameter {
  return Object.freeze({ ...sourceRepresentationParameterReference(identity, prefix, dependencies),
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([...constraints]) }) });
}

export function sourceRepresentationParameterReference(identity: string, prefix: string,
  dependencies: readonly TargetTypeRef[]): Extract<TargetTypeRef, { readonly kind: "type-parameter" }> {
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 20);
  return Object.freeze({ kind: "type-parameter", identity, name: `${prefix}_${suffix}`,
    csharpRequirementDependencies: Object.freeze([...dependencies]) });
}

export function sourceRepresentationDependencies(host: Pick<CsharpRepresentationHost, "source" | "identity">,
  evidence: SourceTypeEvidence): readonly TargetTypeRef[] {
  host.source.assertEvidence(evidence);
  return Object.freeze(host.source.freeParameters(evidence).map(parameter => {
    const identity = host.identity(parameter.declaration);
    if (identity.name === undefined || identity.name.length === 0) throw new TypeError("An original Source type parameter requires its actual authored Native binder name.");
    return Object.freeze({ kind: "type-parameter" as const, identity: identity.identity,
      name: identity.name, csharpDeclaration: parameter.declaration });
  }));
}
