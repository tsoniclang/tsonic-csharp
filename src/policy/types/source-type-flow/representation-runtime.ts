import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef, CsharpRepresentedTypeParameter, CsharpTypeParameterConstraint } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { csharpTargetTypeFromBinding } from "../storage/bindings.js";
import { nativeRepresentationFailure, represented } from "./representation-results.js";
import { createHash } from "node:crypto";
import type { SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpRepresentationHost } from "./representation-host.js";

export function sourceNativeType(host: Pick<CsharpRepresentationHost, "providers">, metadataName: string,
  arguments_: readonly TargetTypeRef[], kind: "struct" | "interface", site: Node): CsharpRepresentationOutcome<TargetTypeRef> {
  const selected = host.providers.findTargetBindingByMetadataName(metadataName, "ordinary");
  if (selected.kind !== "resolved") return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
    `The Native helper '${metadataName}' requires its actual acquired target binding${selected.kind === "missing" ? "." : `: ${selected.diagnostic.message}`}`);
  const binding = selected.binding;
  if (binding.target !== "csharp" || binding.kind !== kind || (binding.typeParameters?.length ?? 0) !== arguments_.length) {
    return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
      `The Native helper '${metadataName}' does not have the required declaration kind and exact ordered binder arity.`);
  }
  const type = csharpTargetTypeFromBinding(binding, arguments_);
  return type?.kind === "target-named" ? represented(Object.freeze(type)) : nativeRepresentationFailure(site,
    "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN", `The Native helper '${metadataName}' has no acquired named physical carrier.`);
}

export function sourceRuntimeType(host: Pick<CsharpRepresentationHost, "providers">, name: string,
  arguments_: readonly TargetTypeRef[], kind: "struct" | "interface", site: Node): CsharpRepresentationOutcome<TargetTypeRef> {
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
