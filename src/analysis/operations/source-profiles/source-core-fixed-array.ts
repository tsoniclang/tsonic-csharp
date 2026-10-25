import { tsonicFixedArrayProviderMember } from "@tsonic/source-core/facts";
import type { SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { resolveCsharpProviderDeclarationEvidence } from "../../../source/extension/provider-identities.js";
import { csharpFixedArrayRepresentationRejection } from "../../../policy/types/collections/fixed-arrays.js";
import { csharpSourcePrimitiveTargetType, isCsharpArrayIndexTargetType, targetTypeRefKey } from "../../../target-model/types/index.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../policy/model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/source-profile-invocations.js";
import { csharpSourceProfileDiagnostic } from "../../../policy/operations/source-profiles/source-profile-policy.js";
import { csharpLiteralIsRepresentableAs } from "../../../policy/conversions/literals.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

import { selectCsharpFixedArrayPropertyPlan, selectCsharpFixedArrayElementPlan } from "../../../policy/operations/source-profiles/source-core-fixed-array.js";
export function selectCsharpSourceCoreFixedArrayProperty(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const declaration = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [source.selectedDeclaration, source.selectedSymbol],
    "member",
  );
  if (
    declaration.kind !== "resolved" ||
    tsonicFixedArrayProviderMember(declaration.declaration) !== "length"
  ) {
    return undefined;
  }
  const rejection = fixedArrayReceiverRejection(host, source.receiver, sourceFile);
  if (rejection !== undefined) return rejectedFixedArrayOperation(rejection);
  const receiver = resolveFixedArrayReceiver(host, source.receiver, sourceFile);
  if (receiver === undefined || source.accessMode !== "read") {
    return rejectedFixedArrayOperation(
      "The selected FixedArray.length access does not have one exact readonly C# array receiver contract.",
    );
  }
  return selectCsharpFixedArrayPropertyPlan(receiver.carrier);
}

export function selectCsharpSourceCoreFixedArrayElement(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfileElementPolicyResult | undefined {
  const signature = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [source.selectedDeclaration, source.selectedSymbol],
    "signature",
  );
  const declaration = signature.kind === "resolved" || signature.kind === "conflict"
    ? signature
    : resolveCsharpProviderDeclarationEvidence(
        host.sourceFacts,
        [source.selectedDeclaration, source.selectedSymbol],
        "member",
      );
  if (
    declaration.kind !== "resolved" ||
    tsonicFixedArrayProviderMember(declaration.declaration) !== "index"
  ) {
    return undefined;
  }
  const rejection = fixedArrayReceiverRejection(host, source.receiver, sourceFile);
  if (rejection !== undefined) return rejectedFixedArrayOperation(rejection);
  const receiver = resolveFixedArrayReceiver(host, source.receiver, sourceFile);
  const integralLiteral = csharpLiteralIsRepresentableAs(host.literalValues.literalValue.get(source.argument.expression), csharpSourcePrimitiveTargetType("int32"));
  const indexSelection = integralLiteral ? undefined : host.types.resolveNode(
    source.argument.expression,
    sourceFile,
  );
  const indexType = integralLiteral ? csharpSourcePrimitiveTargetType("int32") : indexSelection?.kind === "rejected"
    ? undefined : indexSelection?.type ?? host.types.resolveType(source.argument.type, sourceFile);
  if (
    receiver === undefined ||
    indexType === undefined ||
    !isCsharpArrayIndexTargetType(indexType)
  ) {
    return rejectedFixedArrayOperation(
      "The selected FixedArray index access does not have exact C# array, integral-index, and element carriers.",
      [
        `Receiver carrier: ${receiver === undefined ? "missing" : targetTypeRefKey(receiver.carrier)}.`,
        `Index carrier: ${indexType === undefined ? "missing" : targetTypeRefKey(indexType)}.`,
      ],
    );
  }
  return selectCsharpFixedArrayElementPlan(receiver.carrier, indexType);
}

function fixedArrayReceiverRejection(
  host: CsharpProviderCallSelectionHost,
  receiver: ResolvedSourcePropertyAccessInfo["receiver"],
  sourceFile: SourceFile,
): string | undefined {
  const selected = host.types.selectFixedArray(receiver.type, sourceFile);
  if (selected === undefined) return undefined;
  return selected.kind === "invalid" ? selected.reason : csharpFixedArrayRepresentationRejection(selected.fact);
}

function resolveFixedArrayReceiver(
  host: CsharpProviderCallSelectionHost,
  receiver: ResolvedSourcePropertyAccessInfo["receiver"],
  sourceFile: SourceFile,
): {
  readonly carrier: Extract<TargetTypeRef, { readonly kind: "array" }>;
} | undefined {
  const selected = host.types.resolveNode(
    receiver.expression,
    sourceFile,
  );
  if (selected?.kind === "rejected") return undefined;
  const carrier = selected?.type ?? host.types.resolveType(receiver.type, sourceFile);
  return carrier?.kind === "array"
    ? { carrier }
    : undefined;
}

function rejectedFixedArrayOperation(
  message: string,
  evidence: readonly string[] = [],
): Extract<
  CsharpSourceProfilePropertyPolicyResult,
  { readonly kind: "rejected" }
> {
  return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic(
      "CSHARP_FIXED_ARRAY_OPERATION_NOT_CLOSED",
      9100920,
      message,
      evidence,
    ),
  };
}
