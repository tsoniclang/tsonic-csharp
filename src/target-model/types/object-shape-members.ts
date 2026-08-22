import type {
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  TargetTypeRef,
} from "./model.js";

export type CsharpObjectShapeMemberLookupProvenance =
  | "checked-property-access"
  | "checked-object-binding-property"
  | "checked-object-literal-property"
  | "finalized-object-rest-member"
  | "finalized-object-spread-member";

export type CsharpObjectShapeMemberLookupResult =
  | {
      readonly kind: "resolved";
      readonly member: CsharpObjectShapeMemberFact;
      readonly evidence: readonly string[];
    }
  | {
      readonly kind: "missing";
      readonly sourceName: string;
      readonly provenance: CsharpObjectShapeMemberLookupProvenance;
      readonly reason:
        | "empty-source-name"
        | "not-in-finalized-shape"
        | "ambiguous-finalized-shape-member";
      readonly evidence: readonly string[];
    };

export function resolveCsharpObjectShapeMemberBySourceContract(
  objectShape: CsharpObjectShapeFact,
  sourceName: string,
  provenance: Exclude<
    CsharpObjectShapeMemberLookupProvenance,
    "checked-property-access"
  >,
): CsharpObjectShapeMemberLookupResult {
  if (sourceName.length === 0) {
    return missingObjectShapeMember(
      sourceName,
      provenance,
      "empty-source-name",
    );
  }
  const matches = objectShape.members.filter(
    (member) => member.sourceName === sourceName,
  );
  return matches.length === 1
    ? {
        kind: "resolved",
        member: matches[0]!,
        evidence: [
          `Object-shape member '${sourceName}' resolved through the explicit source-to-target shape contract.`,
          `Lookup provenance: ${provenance}.`,
        ],
      }
    : missingObjectShapeMember(
        sourceName,
        provenance,
        matches.length === 0
          ? "not-in-finalized-shape"
          : "ambiguous-finalized-shape-member",
      );
}

export function resolveCsharpObjectShapeMemberBySelectedSubject(
  objectShape: CsharpObjectShapeFact,
  selectedSubjects: readonly unknown[],
): CsharpObjectShapeMemberLookupResult {
  const presentSubjects = selectedSubjects.filter(
    (subject) => subject !== undefined,
  );
  const matches = objectShape.members.filter((member) =>
    member.sourceSubjects?.some((subject) =>
      presentSubjects.includes(subject)
    ) === true
  );
  return matches.length === 1
    ? {
        kind: "resolved",
        member: matches[0]!,
        evidence: [
          "Object-shape member resolved from exact checker-selected source declaration or symbol evidence.",
          "Lookup provenance: checked-property-access.",
        ],
      }
    : missingObjectShapeMember(
        "<selected-subject>",
        "checked-property-access",
        matches.length === 0
          ? "not-in-finalized-shape"
          : "ambiguous-finalized-shape-member",
      );
}

export function resolveCsharpObjectShapeMemberReadTargetType(
  member: CsharpObjectShapeMemberFact,
  selectedSourceType: Type | undefined,
  sourceTypesAgree: (left: Type, right: Type) => boolean =
    (left, right) => left === right,
): TargetTypeRef | undefined {
  return selectedSourceType !== undefined &&
      member.sourceTypes?.some((sourceType) =>
        sourceTypesAgree(sourceType, selectedSourceType)
      ) === true
    ? member.type
    : undefined;
}

export function csharpObjectShapeMemberLookupFailureMessage(
  result: Extract<
    CsharpObjectShapeMemberLookupResult,
    { readonly kind: "missing" }
  >,
  operation: string,
): string {
  switch (result.reason) {
    case "empty-source-name":
      return `${operation} requires a non-empty source member identity.`;
    case "not-in-finalized-shape":
      return `${operation} source member '${result.sourceName}' is absent from the exact object-shape contract.`;
    case "ambiguous-finalized-shape-member":
      return `${operation} source member '${result.sourceName}' matches multiple object-shape contract members.`;
  }
}

function missingObjectShapeMember(
  sourceName: string,
  provenance: CsharpObjectShapeMemberLookupProvenance,
  reason: Extract<
    CsharpObjectShapeMemberLookupResult,
    { readonly kind: "missing" }
  >["reason"],
): CsharpObjectShapeMemberLookupResult {
  return {
    kind: "missing",
    sourceName,
    provenance,
    reason,
    evidence: [
      `Object-shape member '${sourceName}' could not be resolved from the exact object-shape contract.`,
      `Lookup provenance: ${provenance}.`,
    ],
  };
}
