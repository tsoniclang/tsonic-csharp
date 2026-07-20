import type {
  ExtensionObservationContext,
  SelectedSourceValueEvidence,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  unwrapNullableTargetType,
} from "../target-rules.js";
import {
  dotnetNativeArrayTypeId,
} from "../../../providers/dotnet/native-array.js";

export function getSourceReceiverTargetType(
  receiver: SelectedSourceValueEvidence,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(receiver.type, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: false,
    }),
  );
}

export function targetTypeRefIsSourceDeclaredReceiver(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined;
}

export function getNativeArrayReceiverType(
  receiver: SelectedSourceValueEvidence,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return asNativeArrayTargetType(getSourceReceiverTargetType(receiver, context, host));
}

export function asNativeArrayTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind === "array") {
    return type;
  }
  if (type?.kind !== "target-named" || type.id !== dotnetNativeArrayTypeId) {
    return undefined;
  }
  const element = type.typeArguments?.[0];
  return element === undefined
    ? undefined
    : {
        kind: "array",
        element,
      };
}
