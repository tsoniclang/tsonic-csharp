import type {
  CsharpMethodTypeArgumentProjection,
} from "../../../policy/types/index.js";
import type {
  DotnetMemberDeclaration,
  DotnetSignatureDeclaration,
  DotnetTypeRef,
} from "../model/types.js";

interface DotnetMethodTypeArgumentProjectionPolicy {
  readonly memberKind: "method";
  readonly memberMetadataName: string;
  readonly memberStatic: true;
  readonly targetTypeParameterIndex: number;
  readonly returnTypeParameterIndex: number;
  readonly projection: CsharpMethodTypeArgumentProjection["kind"];
}

const dotnetMethodTypeArgumentProjectionPolicies:
  readonly DotnetMethodTypeArgumentProjectionPolicy[] = Object.freeze([
    Object.freeze({
      memberKind: "method",
      memberMetadataName: "System.Text.Json.JsonSerializer.Deserialize",
      memberStatic: true,
      targetTypeParameterIndex: 0,
      returnTypeParameterIndex: 0,
      projection: "project-constructible-object-shape",
    }),
  ]);

export function dotnetMethodTypeArgumentProjections(
  member: DotnetMemberDeclaration,
  signature: DotnetSignatureDeclaration,
): readonly CsharpMethodTypeArgumentProjection[] {
  const parameters = signature.typeParameters ?? [];
  const returnType = signature.targetReturnType ?? signature.returnType;
  return Object.freeze(
    dotnetMethodTypeArgumentProjectionPolicies.flatMap((policy) => {
      const returnParameter = parameters[policy.returnTypeParameterIndex];
      return member.kind === policy.memberKind &&
          member.metadataName === policy.memberMetadataName &&
          member.static === policy.memberStatic &&
          returnParameter !== undefined &&
          policy.targetTypeParameterIndex < parameters.length &&
          returnTypeReferencesExactTypeParameter(
            returnType,
            returnParameter.name,
          )
        ? [Object.freeze({
            kind: policy.projection,
            targetTypeParameterIndex: policy.targetTypeParameterIndex,
          })]
        : [];
    }),
  );
}

function returnTypeReferencesExactTypeParameter(
  type: DotnetTypeRef | undefined,
  name: string,
): boolean {
  if (type?.kind === "nullable" || type?.kind === "nullable-reference") {
    return returnTypeReferencesExactTypeParameter(type.elementType, name);
  }
  return type?.kind === "type-parameter" && type.name === name;
}
