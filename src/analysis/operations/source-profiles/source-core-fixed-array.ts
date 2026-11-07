import { tsonicFixedArrayProviderMember } from "@tsonic/source-core/facts";
import type { Node } from "@tsonic/tsts";
import type { SourceMemberAccessSelection } from "@tsonic/target-api/source";
import { sourceMemberAccess } from "../../program/source-facts.js";
import { resolveCsharpProviderDeclarationEvidence } from "../../../source/extension/provider-identities.js";
import { csharpFixedArrayRepresentationRejection } from "../../../policy/types/collections/fixed-arrays.js";
import { csharpSourcePrimitiveTargetType, isCsharpArrayIndexTargetType, targetTypeRefKey } from "../../../target-model/types/index.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../policy/model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/program/source-profile-invocations.js";
import { csharpSourceProfileDiagnostic } from "../../../policy/operations/source-profiles/source-profile-policy.js";
import { csharpLiteralIsRepresentableAs } from "../../../policy/conversions/literals.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { selectCsharpFixedArrayPropertyPlan, selectCsharpFixedArrayElementPlan } from "../../../policy/operations/source-profiles/source-core-fixed-array.js";
export function selectCsharpSourceCoreFixedArrayProperty(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const source = sourceMemberAccess(host.facts, access);
  const declaration = resolveCsharpProviderDeclarationEvidence(host.sourceFacts, selectedDeclarations(source), "member");
  if (
    declaration.kind !== "resolved" ||
    tsonicFixedArrayProviderMember(declaration.declaration) !== "length"
  ) {
    return undefined;
  }
  const rejection = fixedArrayReceiverRejection(host, source.receiver, source.receiverType);
  if (rejection !== undefined) return rejectedFixedArrayOperation(rejection);
  const receiver = resolveFixedArrayReceiver(host, source.receiver);
  if (receiver === undefined || source.access !== "read") {
    return rejectedFixedArrayOperation(
      "The selected FixedArray.length access does not have one exact readonly C# array receiver contract.",
    );
  }
  return selectCsharpFixedArrayPropertyPlan(receiver.carrier);
}

export function selectCsharpSourceCoreFixedArrayElement(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfileElementPolicyResult | undefined {
  const source = host.facts.values.elementAccess(access);
  const selected = source.selected;
  const subjects = selected.kind === "member" || selected.kind === "index-signature" || selected.kind === "element"
    ? [selected.declaration] : [];
  const signature = resolveCsharpProviderDeclarationEvidence(host.sourceFacts, subjects, "signature");
  const declaration = signature.kind === "resolved" || signature.kind === "conflict"
    ? signature
    : resolveCsharpProviderDeclarationEvidence(host.sourceFacts, subjects, "member");
  if (
    declaration.kind !== "resolved" ||
    tsonicFixedArrayProviderMember(declaration.declaration) !== "index"
  ) {
    return undefined;
  }
  const rejection = fixedArrayReceiverRejection(host, source.receiver, source.receiverType);
  if (rejection !== undefined) return rejectedFixedArrayOperation(rejection);
  const receiver = resolveFixedArrayReceiver(host, source.receiver);
  const index = host.ast.as.AsElementAccessExpression(access)?.ArgumentExpression;
  if (index === undefined) return undefined;
  const integralLiteral = csharpLiteralIsRepresentableAs(host.facts.values.literal(index), csharpSourcePrimitiveTargetType("int32"));
  const indexSelection = integralLiteral ? undefined : host.types.value(index);
  const indexType = integralLiteral ? csharpSourcePrimitiveTargetType("int32")
    : indexSelection === undefined || indexSelection.kind === "csharp-refused" ? undefined : indexSelection;
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

function selectedDeclarations(source: SourceMemberAccessSelection): readonly Node[] {
  return source.selected.kind === "member" ? source.selected.declarations : [source.selected.declaration];
}

function fixedArrayReceiverRejection(
  host: CsharpProviderCallSelectionHost,
  receiver: Node,
  receiverType: SourceMemberAccessSelection["receiverType"],
): string | undefined {
  const selected = host.types.selectFixedArray(receiverType, receiver);
  if (selected === undefined) return undefined;
  return csharpFixedArrayRepresentationRejection(selected.fact);
}

function resolveFixedArrayReceiver(
  host: CsharpProviderCallSelectionHost,
  receiver: Node,
): {
  readonly carrier: Extract<TargetTypeRef, { readonly kind: "array" }>;
} | undefined {
  const carrier = host.types.value(receiver);
  return carrier.kind === "array"
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
