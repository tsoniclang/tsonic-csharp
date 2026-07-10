import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "./types.js";

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
      readonly reason: "empty-source-name" | "not-in-finalized-shape" | "ambiguous-finalized-shape-member";
      readonly evidence: readonly string[];
    };

export function resolveCsharpObjectShapeMemberByFinalizedSourceName(
  objectShape: CsharpObjectShapeFact,
  sourceName: string,
  provenance: CsharpObjectShapeMemberLookupProvenance,
): CsharpObjectShapeMemberLookupResult {
  if (sourceName.length === 0) {
    return missingCsharpObjectShapeMember(sourceName, provenance, "empty-source-name");
  }
  const matches: CsharpObjectShapeMemberFact[] = [];
  for (const member of objectShape.members) {
    if (member.sourceName === sourceName) {
      matches.push(member);
    }
  }
  if (matches.length === 1) {
    return {
      kind: "resolved",
      member: matches[0]!,
      evidence: [
        `Object-shape member '${sourceName}' resolved by matching checked source member identity against finalized object-shape facts.`,
        `Lookup provenance: ${provenance}.`,
      ],
    };
  }
  return missingCsharpObjectShapeMember(
    sourceName,
    provenance,
    matches.length === 0 ? "not-in-finalized-shape" : "ambiguous-finalized-shape-member",
  );
}

export function resolveCsharpObjectShapeMemberBySelectedSubject(
  objectShape: CsharpObjectShapeFact,
  selectedSubjects: readonly unknown[],
): CsharpObjectShapeMemberLookupResult {
  const presentSubjects = selectedSubjects.filter((subject) => subject !== undefined);
  const matches = objectShape.members.filter((member) =>
    member.sourceSubjects?.some((subject) => presentSubjects.includes(subject)) === true);
  if (matches.length === 1) {
    return {
      kind: "resolved",
      member: matches[0]!,
      evidence: [
        "Object-shape member resolved from exact TSTS-selected source declaration/symbol identity and finalized object-shape facts.",
        "Lookup provenance: checked-property-access.",
      ],
    };
  }
  return missingCsharpObjectShapeMember(
    "<selected-subject>",
    "checked-property-access",
    matches.length === 0 ? "not-in-finalized-shape" : "ambiguous-finalized-shape-member",
  );
}

export function csharpObjectShapeMemberLookupFailureMessage(
  result: Extract<CsharpObjectShapeMemberLookupResult, { readonly kind: "missing" }>,
  operation: string,
): string {
  switch (result.reason) {
    case "empty-source-name":
      return `${operation} requires a non-empty checked source member name before C# emission.`;
    case "not-in-finalized-shape":
      return `${operation} source member '${result.sourceName}' must match a finalized object-shape member before C# emission.`;
    case "ambiguous-finalized-shape-member":
      return `${operation} source member '${result.sourceName}' matched multiple finalized object-shape members; object-shape facts must be unambiguous before C# emission.`;
  }
}

function missingCsharpObjectShapeMember(
  sourceName: string,
  provenance: CsharpObjectShapeMemberLookupProvenance,
  reason: Extract<CsharpObjectShapeMemberLookupResult, { readonly kind: "missing" }>["reason"],
): CsharpObjectShapeMemberLookupResult {
  return {
    kind: "missing",
    sourceName,
    provenance,
    reason,
    evidence: [
      `Object-shape member '${sourceName}' could not be resolved from finalized object-shape facts.`,
      `Lookup provenance: ${provenance}.`,
    ],
  };
}
