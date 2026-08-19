import { tsonicFixedArrayProviderMember } from "@tsonic/source-core/facts";
import type {
  SourceFile,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import {
  resolveCsharpProviderDeclarationEvidence,
} from "../../../providers/relations/evidence.js";
import {
  csharpSourcePrimitiveTargetType,
  isCsharpArrayIndexTargetType,
  targetTypeRefKey,
} from "../../types/index.js";
import type {
  CsharpProviderCallSelectionHost,
} from "../selection/call-selection.js";
import type {
  CsharpSourceProfileElementPolicyResult,
  CsharpSourceProfilePropertyPolicyResult,
} from "./source-profile-policy.js";
import {
  csharpSourceProfileDiagnostic,
} from "./source-profile-policy.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedPropertyAccessInfo"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedElementAccessInfo"]>
>;

const instanceReceiver = { kind: "instance" } as const;

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
  const receiver = resolveFixedArrayReceiver(host, source.receiver, sourceFile);
  if (receiver === undefined || source.accessMode !== "read") {
    return rejectedFixedArrayOperation(
      "The selected FixedArray.length access does not have one exact readonly C# array receiver contract.",
    );
  }
  return {
    kind: "resolved",
    targetMember: Object.freeze({
      id: "tsonic.csharp.source-core.FixedArray.length",
      sourceName: "length",
      targetName: "Length",
      kind: "property",
      declaringType: receiver.carrier,
      parameters: [],
      returnType: csharpSourcePrimitiveTargetType("int32"),
      readonly: true,
    }),
    receiver: instanceReceiver,
  };
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
  const receiver = resolveFixedArrayReceiver(host, source.receiver, sourceFile);
  const indexType = host.types.resolveNode(
    source.argument.expression,
    sourceFile,
  ) ?? host.types.resolveType(source.argument.type, sourceFile);
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
  return {
    kind: "resolved",
    targetMember: Object.freeze({
      id: "tsonic.csharp.source-core.FixedArray.index",
      sourceName: "Item",
      targetName: "Item",
      kind: "indexer",
      declaringType: receiver.carrier,
      parameters: [Object.freeze({
        name: "index",
        type: indexType,
        passingMode: "by-value",
      })],
      returnType: receiver.carrier.element,
    }),
    targetParameterIndex: 0,
    receiver: instanceReceiver,
    invocation: { kind: "indexer" },
  };
}

function resolveFixedArrayReceiver(
  host: CsharpProviderCallSelectionHost,
  receiver: ResolvedSourcePropertyAccessInfo["receiver"],
  sourceFile: SourceFile,
): {
  readonly carrier: Extract<
    NonNullable<ReturnType<typeof host.types.resolveNode>>,
    { readonly kind: "array" }
  >;
} | undefined {
  const carrier = host.types.resolveNode(
    receiver.expression,
    sourceFile,
  ) ?? host.types.resolveType(receiver.type, sourceFile);
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
