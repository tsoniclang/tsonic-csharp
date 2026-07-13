import type {
  CheckedConversionMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourcePrimitiveFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import {
  getTargetArgumentConversionType,
} from "./target-member-arguments/argument-conversions.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import {
  resolveDirectTargetTypeRefFromSubjectFacts,
} from "./target-type-subject-facts.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;

export type CsharpCheckedConversionEvidence =
  | {
      readonly kind: "resolved";
      readonly source?: TargetTypeRef;
      readonly target?: TargetTypeRef;
    }
  | {
      readonly kind: "unreconciled";
      readonly side: "source" | "target";
      readonly semantic?: TargetTypeRef;
      readonly authored: TargetTypeRef;
      readonly authoredCandidates?: readonly TargetTypeRef[];
      readonly reason: string;
    };

interface AuthoredTargetEvidence {
  readonly target: TargetTypeRef;
  readonly sourcePrimitive?: SourcePrimitiveFact;
}

type AuthoredSourceResolution =
  | { readonly kind: "missing" }
  | { readonly kind: "resolved"; readonly evidence: AuthoredTargetEvidence }
  | { readonly kind: "conflict"; readonly candidates: readonly AuthoredTargetEvidence[] };

export function resolveCsharpCheckedConversionEvidence(
  request: CheckedConversionMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  host: CsharpOperationsProviderHost,
): CsharpCheckedConversionEvidence {
  if (request.conversionKind === "call-argument") {
    return {
      kind: "resolved",
      source: host.getTargetTypeRefForSubject(request.source, context, noRuntimeCarrierQuery),
      target: host.getTargetTypeRefForSubject(getTargetArgumentConversionType(request.targetParameter), context),
    };
  }

  const semanticSource = host.getTargetTypeRefForSubject(request.source, context, noRuntimeCarrierQuery);
  const semanticTarget = host.getTargetTypeRefForSubject(request.target, context);
  const expressionSource = resolveDirectEvidenceTarget(request.sourceExpression, context, host, noRuntimeCarrierQuery);
  if (expressionSource !== undefined) {
    const authoredTarget = resolveDirectEvidenceTarget(
      request.explicitTargetTypeNode,
      context,
      host,
      noRuntimeCarrierQuery,
    );
    const target = authoredTarget?.target ?? semanticTarget;
    return {
      kind: "resolved",
      source: expressionSource.target,
      ...(target === undefined ? {} : { target }),
    };
  }

  const authoredSource = resolveConsistentAuthoredSource(request, context, host);
  if (authoredSource.kind === "conflict") {
    return {
      kind: "unreconciled",
      side: "source",
      ...(semanticSource === undefined ? {} : { semantic: semanticSource }),
      authored: authoredSource.candidates[0]!.target,
      authoredCandidates: authoredSource.candidates.map((candidate) => candidate.target),
      reason: "Supplied selected source provenance resolves to conflicting finalized target facts.",
    };
  }
  const source = reconcileAuthoredSourceWithSemantic(
    semanticSource,
    authoredSource.kind === "resolved" ? authoredSource.evidence : undefined,
  );
  if (source.kind === "unreconciled") {
    return source;
  }

  const authoredTarget = resolveDirectEvidenceTarget(
    request.explicitTargetTypeNode,
    context,
    host,
    noRuntimeCarrierQuery,
  );
  const target = authoredTarget?.target ?? semanticTarget;
  return {
    kind: "resolved",
    ...(source.value === undefined ? {} : { source: source.value }),
    ...(target === undefined ? {} : { target }),
  };
}

function resolveConsistentAuthoredSource(
  request: Extract<CheckedConversionMappingRequest, { readonly conversionKind: "assertion" }>,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  host: CsharpOperationsProviderHost,
): AuthoredSourceResolution {
  const candidates = [
    request.sourceSelectedSymbol,
    request.sourceSelectedDeclaration,
    request.sourceSelectedDeclarationTypeNode,
  ]
    .map((subject) => resolveDirectEvidenceTarget(subject, context, host, noRuntimeCarrierQuery))
    .filter((candidate): candidate is AuthoredTargetEvidence => candidate !== undefined);
  if (candidates.length === 0) {
    return { kind: "missing" };
  }
  const first = candidates[0];
  return first !== undefined && candidates.every((candidate) => targetTypeRefEquals(first.target, candidate.target))
    ? { kind: "resolved", evidence: first }
    : { kind: "conflict", candidates };
}

function reconcileAuthoredSourceWithSemantic(
  semantic: TargetTypeRef | undefined,
  authored: AuthoredTargetEvidence | undefined,
): { readonly kind: "resolved"; readonly value?: TargetTypeRef } | Extract<CsharpCheckedConversionEvidence, { readonly kind: "unreconciled" }> {
  if (authored === undefined) {
    return { kind: "resolved", ...(semantic === undefined ? {} : { value: semantic }) };
  }
  if (semantic !== undefined && targetTypeRefEquals(authored.target, semantic)) {
    return { kind: "resolved", value: authored.target };
  }
  if (authored.sourcePrimitive !== undefined) {
    return { kind: "resolved", value: authored.target };
  }
  return {
    kind: "unreconciled",
    side: "source",
    ...(semantic === undefined ? {} : { semantic }),
    authored: authored.target,
    reason: semantic === undefined
      ? "Authored source/provider evidence has no mechanically comparable semantic target type."
      : "Authored source/provider evidence conflicts with the checker-selected semantic target type.",
  };
}

function resolveDirectEvidenceTarget(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
  host: CsharpOperationsProviderHost | undefined,
  options: TargetTypeRefResolutionOptions,
): AuthoredTargetEvidence | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const target = resolveDirectTargetTypeRefFromSubjectFacts(
    subject,
    context,
    options,
    (nestedSubject, nestedContext, nestedOptions) =>
      host?.getTargetTypeRefForSubject(nestedSubject, nestedContext, nestedOptions),
  );
  if (target === undefined) {
    return undefined;
  }
  const sourcePrimitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  return {
    target,
    ...(sourcePrimitive === undefined ? {} : { sourcePrimitive }),
  };
}
