import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef, CsharpTypeParameterConstraint } from "../../../target-model/types/native-type-data.js";
import type { CsharpTargetNamedTypeRef, TargetBindingFact } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentedType } from "../../../target-model/types/representation.js";
import type { CsharpPolicyContext } from "../../model/context.js";
import { csharpProviderBindingFromResolution } from "../../../providers/model/relation-resolver.js";
import { csharpTargetTypeFromBinding } from "../storage/bindings.js";
import { csharpReadOnlyListTargetType } from "../../../target-model/types/carriers/collections.js";
import { getCsharpCallableValueSignature } from "../../../target-model/types/carriers/delegates.js";
import { isCsharpValueTypeTargetType, isCsharpStringTargetType } from "../../../target-model/types/identity.js";
import { represented, nativeRepresentationFailure } from "./representation-results.js";

export function selectCsharpRepresentationConstraints(input: {
  readonly bound: CsharpRepresentedType | undefined;
  readonly parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
  readonly nativeDeclarationKind: (carrier: TargetTypeRef) => TargetBindingFact["kind"] | undefined;
  readonly providers: Pick<CsharpPolicyContext["providers"], "findTargetBindingByMetadataName">;
  readonly site: Node;
}): CsharpRepresentationOutcome<readonly CsharpTypeParameterConstraint[]> {
  const { bound, parameter, site } = input;
  if (bound === undefined) return represented(Object.freeze([]));
  const category = bound.evidence.category;
  if (category.kind === "known" && (category.category === "number" || category.category === "bigint") &&
    (bound.carrier.kind === "source-primitive" || bound.carrier.kind === "target-named" && bound.carrier.id === "System.Numerics.BigInteger")) {
    return nativeConstraint("System.Numerics.INumber`1", [parameter]);
  }
  if (bound.evidence.type.kind === "intrinsic" && bound.evidence.type.intrinsic === "object") return represented(Object.freeze([]));
  const carrier = bound.carrier;
  if (carrier.kind === "type-parameter") return represented(Object.freeze([{ kind: "type", type: carrier }]));
  if (carrier.kind === "array") return represented(Object.freeze([{ kind: "type", type: csharpReadOnlyListTargetType(carrier.element) }]));
  if (carrier.kind === "target-named" &&
    ((carrier as CsharpTargetNamedTypeRef).csharpStructuralContract === true || input.nativeDeclarationKind(carrier) === "interface")) {
    return represented(Object.freeze([{ kind: "type", type: carrier }]));
  }
  if (getCsharpCallableValueSignature(carrier) !== undefined) return nativeConstraint("System.Delegate", []);
  if (isCsharpValueTypeTargetType(carrier) || isCsharpStringTargetType(carrier)) return represented(Object.freeze([]));
  if (carrier.kind === "target-named") {
    if (input.nativeDeclarationKind(carrier) === "class") return represented(Object.freeze([{ kind: "type", type: carrier }]));
  }
  return nativeRepresentationFailure(site, "CSHARP_GENERIC_CONSTRAINT_REPRESENTATION_UNSUPPORTED",
    "The Source bound has no selected legal Native generic constraint; it cannot be replaced by a guessed class constraint.");

  function nativeConstraint(metadataName: string, arguments_: readonly TargetTypeRef[]):
    CsharpRepresentationOutcome<readonly CsharpTypeParameterConstraint[]> {
    const binding = csharpProviderBindingFromResolution(input.providers.findTargetBindingByMetadataName(metadataName, "ordinary"));
    const type = binding === undefined || (binding.typeParameters?.length ?? 0) !== arguments_.length
      ? undefined : csharpTargetTypeFromBinding(binding, arguments_);
    return type === undefined ? nativeRepresentationFailure(site, "CSHARP_NATIVE_CONSTRAINT_BINDING_MISSING",
      `Native constraint '${metadataName}' requires its exact provider binding and complete ordered type arguments.`)
      : represented(Object.freeze([{ kind: "type", type }]));
  }
}
