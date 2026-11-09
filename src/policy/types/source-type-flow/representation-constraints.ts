import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef, CsharpTypeParameterConstraint } from "../../../target-model/types/native-type-data.js";
import type { CsharpTargetNamedTypeRef, TargetBindingFact } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentedType } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { sourceNativeGenericDefinition } from "./representation-runtime.js";
import { applyCsharpNativeGenericType } from "../../../target-model/types/native-generics.js";
import { getCsharpCallableValueSignature } from "../../../target-model/types/carriers/delegates.js";
import { isCsharpValueTypeTargetType, isCsharpStringTargetType } from "../../../target-model/types/identity.js";
import { represented, nativeRepresentationFailure } from "./representation-results.js";

export function selectCsharpRepresentationConstraints(input: {
  readonly bound: CsharpRepresentedType | undefined;
  readonly parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
  readonly nativeDeclarationKind: (carrier: TargetTypeRef) => CsharpRepresentationOutcome<TargetBindingFact["kind"] | undefined>;
  readonly providers: CsharpRepresentationHost["providers"];
  readonly acquireNativeDeclaration: CsharpRepresentationHost["acquireNativeDeclaration"];
  readonly site: Node;
}): CsharpRepresentationOutcome<readonly CsharpTypeParameterConstraint[]> {
  const { bound, parameter, site } = input;
  if (bound === undefined) return represented(Object.freeze([]));
  const category = bound.evidence.category;
  if (category.kind === "known" && (category.category === "number" || category.category === "bigint") &&
    (bound.carrier.kind === "source-primitive" || bound.carrier.kind === "target-named" && bound.carrier.id === "System.Numerics.BigInteger")) {
    return nativeConstraint("System.Numerics.INumber`1", [parameter], "interface");
  }
  if (bound.evidence.type.kind === "intrinsic" && bound.evidence.type.intrinsic === "object") return represented(Object.freeze([]));
  const carrier = bound.carrier;
  if (carrier.kind === "type-parameter") return represented(Object.freeze([{ kind: "type", type: carrier }]));
  if (carrier.kind === "array") return nativeConstraint("System.Collections.Generic.IReadOnlyList`1", [carrier.element], "interface");
  if (carrier.kind === "target-named" && (carrier as CsharpTargetNamedTypeRef).csharpStructuralContract === true) {
    return represented(Object.freeze([{ kind: "type", type: carrier }]));
  }
  const declarationKind = carrier.kind === "target-named" ? input.nativeDeclarationKind(carrier) : represented(undefined);
  if (declarationKind.kind !== "represented") return declarationKind;
  if (declarationKind.value === "interface") return represented(Object.freeze([{ kind: "type", type: carrier }]));
  if (getCsharpCallableValueSignature(carrier) !== undefined) return nativeConstraint("System.Delegate", [], "class");
  if (isCsharpValueTypeTargetType(carrier) || isCsharpStringTargetType(carrier)) return represented(Object.freeze([]));
  if (carrier.kind === "target-named") {
    if (declarationKind.value === "class") return represented(Object.freeze([{ kind: "type", type: carrier }]));
  }
  return nativeRepresentationFailure(site, "CSHARP_GENERIC_CONSTRAINT_REPRESENTATION_UNSUPPORTED",
    "The Source bound has no selected legal Native generic constraint; it cannot be replaced by a guessed class constraint.");

  function nativeConstraint(metadataName: string, arguments_: readonly TargetTypeRef[], kind: "interface" | "class"):
    CsharpRepresentationOutcome<readonly CsharpTypeParameterConstraint[]> {
    const definition = sourceNativeGenericDefinition(input, metadataName, arguments_.length, kind, site);
    if (definition.kind !== "represented") return definition;
    return represented(Object.freeze([{ kind: "type", type: applyCsharpNativeGenericType(definition.value, arguments_) }]));
  }
}
