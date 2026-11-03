import type { Node } from "@tsonic/tsts";
import { AsSpreadAssignment, selectSourceObjectLiteralAccessors, type SourceFileSemantics } from "@tsonic/target-api/source";
import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import { formLiteralMemberEvidence, projectLiteralMemberEvidence,
  type CsharpLiteralMemberEvidenceProjection, type CsharpLiteralMemberEvidenceSource } from "./member-source.js";
import type { CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import { formInstantiatedObjectShapeSource, type CsharpObjectShapeSource,
  type CsharpObjectShapeSourceMember } from "./shape-source.js";

export interface CsharpObjectLiteralShapeSource {
  readonly objectLiteral: Node;
  readonly queries: SourceFileSemantics;
  readonly accessors: ReturnType<typeof selectSourceObjectLiteralAccessors>;
  readonly memberEvidence: CsharpLiteralMemberEvidenceSource;
  readonly spreads: readonly { readonly property: Node; readonly expression: Node | undefined }[];
}

export type CsharpObjectLiteralActualSource =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly source: CsharpObjectShapeSource };

export interface CsharpObjectLiteralConstructionSource {
  readonly literal: CsharpObjectLiteralShapeSource;
  readonly expected: CsharpObjectShapeSource | undefined;
  readonly actual: CsharpObjectLiteralActualSource;
  readonly selected: CsharpObjectShapeSource | undefined;
  readonly additional: readonly CsharpObjectShapeSourceMember[];
  readonly members: CsharpLiteralMemberEvidenceProjection<CsharpObjectShapeMemberProofInput> | undefined;
}

export function formCsharpObjectLiteralShapeSource(
  host: Pick<CsharpObjectShapePolicyHost, "ast">,
  objectLiteral: Node,
  queries: SourceFileSemantics,
): CsharpObjectLiteralShapeSource {
  const spreads = host.ast.properties(objectLiteral).flatMap(property =>
    property === undefined || !host.ast.is.IsSpreadAssignment(property) ? []
      : [Object.freeze({ property, expression: AsSpreadAssignment(host.ast, property)?.Expression })]);
  return Object.freeze({ objectLiteral, queries,
    accessors: selectSourceObjectLiteralAccessors(host.ast, queries, objectLiteral),
    memberEvidence: formLiteralMemberEvidence(host, objectLiteral, queries),
    spreads: Object.freeze(spreads),
  });
}

export function formCsharpObjectLiteralConstructionSource(
  literal: CsharpObjectLiteralShapeSource,
  expected: CsharpObjectShapeSource | undefined,
  actual: CsharpObjectLiteralActualSource,
): CsharpObjectLiteralConstructionSource {
  if (expected === undefined) return Object.freeze({ literal, expected, actual,
    selected: undefined, additional: Object.freeze([]), members: undefined });
  const selected = actual.kind === "absent" ? expected
    : formInstantiatedObjectShapeSource(expected, actual.source.sourceType, literal.queries);
  const additional = actual.kind === "absent" ? Object.freeze([])
    : Object.freeze(actual.source.members.filter(member =>
        !expected.members.some(previous => csharpSourceMemberKeysEqual(previous.sourceKey, member.sourceKey))));
  const members = selected === undefined ? undefined : projectLiteralMemberEvidence(
    Object.freeze([...selected.members.map(member => member.proof), ...additional.map(member => member.proof)]),
    literal.memberEvidence);
  return Object.freeze({ literal, expected, actual, selected, additional, members });
}
