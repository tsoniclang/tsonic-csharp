import {
  acceptObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import {
  dotnetNativeArrayTypeId,
  isDotnetNativeArrayCreateMemberId,
} from "../../../providers/dotnet/native-array.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  csharpTargetArrayCreationOperation,
  recordCsharpTargetOperation,
} from "../operations.js";
import {
  asNodeSubject,
} from "../ast-utils.js";
import {
  instantiateSelectedTargetMember,
} from "../selected-target-member-instantiation.js";
import {
  targetMemberIsClosed,
} from "../target-ref-utils.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";

export function mapDotnetNativeArrayCreateCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
  virtualDeclaration: ProviderVirtualDeclarationFact | undefined,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const selectedMemberId = virtualDeclaration?.signatureId ?? virtualDeclaration?.memberId;
  if (selectedMemberId === undefined || !isDotnetNativeArrayCreateMemberId(selectedMemberId)) {
    return undefined;
  }
  const targetBinding = host.getCsharpTargetBindingByTargetId(dotnetNativeArrayTypeId);
  if (targetBinding === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_CREATE_TARGET_FACT_NOT_PROVEN", 9100135, "C# native array creation requires finalized provider target binding facts for the explicit .NET Array source contract."));
  }
  const member = targetBinding.members?.find((candidate) => candidate.id === selectedMemberId);
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_NATIVE_ARRAY_CREATE_MEMBER_FACT_NOT_PROVEN",
      9100154,
      "C# native array creation requires a provider-owned target member fact for the explicit .NET Array.create source contract.",
      [{
        message: "C# native array create member metadata was missing from the selected provider target binding.",
        details: {
          bindingId: targetBinding.id,
          selectedMemberId,
          candidateMemberIds: targetBinding.members?.map((candidate) => candidate.id) ?? [],
        },
      }],
    ));
  }
  const nativeArrayElementType = getNativeArrayCreateElementType(request, context, host);
  if (nativeArrayElementType === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_CREATE_ELEMENT_TYPE_NOT_PROVEN", 9100134, "C# native array creation requires an explicit or contextual TSTS-proven element target type."));
  }
  const csharpMember = instantiateSelectedTargetMember(
    { member, targetTypeArguments: [nativeArrayElementType] },
    host,
    {},
  );
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetArrayCreationOperation(csharpMember.id, nativeArrayElementType, csharpMember), [{ message: "C# native array creation operation finalized from checked TSTS provider declaration and explicit target array facts." }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: csharpMember, targetTypeArguments: [nativeArrayElementType] },
  }, [{ message: "C# native array creation selected from checked TSTS provider declaration." }]);
}

export function getNativeArrayCreateElementType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const ast = context.compiler?.ast;
  const callNode = asNodeSubject(request.call);
  if (ast !== undefined && callNode !== undefined) {
    const explicitTypeArguments = ast.typeArguments(callNode)
      .map((argument) => host.getTargetTypeRefForSubject(argument, context));
    if (explicitTypeArguments.length === 1 && explicitTypeArguments[0] !== undefined) {
      return explicitTypeArguments[0];
    }
  }
  const contextualReturnType = host.getTargetTypeRefForSubject(request.sourceReturnType, context);
  return contextualReturnType?.kind === "array" ? contextualReturnType.element : undefined;
}
