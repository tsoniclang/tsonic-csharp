import type { Node } from "@tsonic/tsts";
import type { SourceResult } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpRepresentedTypeParameter } from "../../../target-model/types/generic-constraints.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpTypeParameterConstraintResolutionKey } from "../../../target-model/types/generic-constraints.js";

export function represented<Value>(value: Value): CsharpRepresentationOutcome<Value> {
  return Object.freeze({ kind: "represented", value });
}

export function sourceOutcome<Value>(result: SourceResult<Value>): CsharpRepresentationOutcome<Value> {
  return result.kind === "resolved" ? represented(result.value) : Object.freeze({ kind: "source-refused", refusal: result });
}

export function nativeRepresentationFailure(
  site: Node,
  code: `CSHARP_${string}`,
  message: string,
): Extract<CsharpRepresentationOutcome<never>, { readonly kind: "native-refused" }> {
  return Object.freeze({ kind: "native-refused", source: "tsonic-csharp", code, message, site });
}

export function representationRequirements(
  groups: readonly (readonly CsharpRepresentedTypeParameter[])[],
): readonly CsharpRepresentedTypeParameter[] {
  const byIdentity = new Map<string, CsharpRepresentedTypeParameter>();
  for (const parameters of groups) for (const parameter of parameters) {
    const previous = byIdentity.get(parameter.identity);
    if (previous !== undefined && (targetTypeRefKey(previous) !== targetTypeRefKey(parameter) ||
      previous.csharpDeclaration !== parameter.csharpDeclaration ||
      JSON.stringify(previous.csharpRequirementDependencies?.map(targetTypeRefKey) ?? []) !==
        JSON.stringify(parameter.csharpRequirementDependencies?.map(targetTypeRefKey) ?? []) ||
      csharpTypeParameterConstraintResolutionKey(previous.csharpConstraints) !== csharpTypeParameterConstraintResolutionKey(parameter.csharpConstraints))) {
      throw new TypeError("A Native representation parameter requires one physical identity.");
    }
    byIdentity.set(parameter.identity, parameter);
  }
  return Object.freeze([...byIdentity.values()]);
}
