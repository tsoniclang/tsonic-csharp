import type { Node, SourceFile } from "@tsonic/tsts";
import { AsSpreadAssignment, selectSourceObjectLiteralAccessors, type SourceFileSemantics } from "@tsonic/target-api/source";
import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import { formLiteralMemberEvidence, projectLiteralMemberEvidence,
  type CsharpLiteralMemberEvidenceProjection, type CsharpLiteralMemberEvidenceSource } from "./member-source.js";
import type { CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import { formInstantiatedObjectShapeSource, type CsharpObjectShapeSource,
  type CsharpObjectShapeSourceMember } from "./shape-source.js";
import { selectCsharpObjectMethodImplementationSource,
  type CsharpObjectMethodImplementationSource } from "./method-implementations.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";

type CsharpObjectLiteralAccessor = Extract<ReturnType<typeof selectSourceObjectLiteralAccessors>,
  { readonly kind: "resolved" }>["members"][number];

export interface CsharpObjectLiteralAccessorSource {
  readonly accessor: CsharpObjectLiteralAccessor;
  readonly index: number | undefined;
  readonly input: CsharpObjectShapeMemberProofInput | undefined;
  readonly output: CsharpObjectShapeMemberProofInput | undefined;
}

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
  readonly additional: readonly { readonly index: number; readonly member: CsharpObjectShapeSourceMember }[];
  readonly members: CsharpLiteralMemberEvidenceProjection<CsharpObjectShapeMemberProofInput> | undefined;
  readonly accessors: readonly CsharpObjectLiteralAccessorSource[];
  readonly output: readonly CsharpObjectShapeSourceMember[] | undefined;
  readonly nativeMethodLiteral: boolean;
  readonly ownedMembers: readonly boolean[];
  readonly implementation: CsharpObjectMethodImplementationSource | undefined;
  readonly captures: readonly {
    readonly node: Node;
    readonly sourceFile: SourceFile | undefined;
    readonly state: CsharpTypeResolutionState;
  }[];
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
  host: Pick<CsharpObjectShapePolicyHost, "ast" | "navigation" | "objectMethodSources">,
  literal: CsharpObjectLiteralShapeSource,
  expected: CsharpObjectShapeSource | undefined,
  actual: CsharpObjectLiteralActualSource,
): CsharpObjectLiteralConstructionSource {
  const selected = expected === undefined ? undefined : actual.kind === "absent" ? expected
    : formInstantiatedObjectShapeSource(expected, actual.source.sourceType ?? expected.sourceType, literal.queries);
  const additional = expected === undefined || actual.kind === "absent" ? Object.freeze([])
    : Object.freeze(actual.source.members.flatMap((member, index) =>
        expected.members.some(previous => csharpSourceMemberKeysEqual(previous.sourceKey, member.sourceKey))
          ? [] : [Object.freeze({ index, member })]));
  const rows = selected === undefined ? undefined : Object.freeze([
    ...selected.members, ...additional.map(selection => selection.member),
  ]);
  const members = selected === undefined ? undefined : projectLiteralMemberEvidence(
    Object.freeze(rows!.map(member => member.proof)),
    literal.memberEvidence);
  const nativeMethodLiteral = rows?.some((row, index) => row.memberKind === "method" &&
    members!.members[index]!.output.sourceDeclarations?.some(declaration =>
      host.ast.is.IsMethodDeclaration(declaration) && host.ast.body(declaration) !== undefined &&
      host.ast.parent(declaration) === literal.objectLiteral) === true) === true;
  const ownedMembers = Object.freeze(members?.members.map(member => member.output.sourceDeclarations?.some(
    declaration => host.ast.parent(declaration) === literal.objectLiteral) === true) ?? []);
  const projected = members === undefined || rows === undefined ? undefined : rows.map((row, index) =>
    Object.freeze({ ...row, proof: members.members[index]!.output }));
  const accessors: CsharpObjectLiteralAccessorSource[] = [];
  if (literal.accessors.kind === "resolved" && projected !== undefined) {
    for (const accessor of literal.accessors.members) {
      const subjects = [accessor.sourceSelectedSymbol, ...accessor.sourceSelectedDeclarations];
      const types = [
        ...(accessor.getter === undefined ? [] : [accessor.getter.sourceSelectedType]),
        ...(accessor.setter === undefined ? [] : [accessor.setter.sourceSelectedType]),
      ];
      const matches = projected.map((member, index) => ({ member, index })).filter(({ member }) =>
        member.proof.sourceSubjects?.some(subject => subjects.some(selectedSubject => selectedSubject === subject)) === true &&
        types.every(type => member.proof.sourceTypes?.some(sourceType => sourceType === type) === true));
      const matched = matches.length === 1 ? matches[0] : undefined;
      const input = matched?.member.proof;
      const output = input === undefined || accessor.getter === undefined ? undefined : Object.freeze({
        ...input,
        sourceSubjects: Object.freeze([
          ...input.sourceSubjects ?? [], accessor.sourceSelectedSymbol, ...accessor.sourceSelectedDeclarations,
          accessor.getter.element, ...(accessor.setter === undefined ? [] : [accessor.setter.element]),
        ]),
        sourceDeclarations: Object.freeze([...new Set([
          ...input.sourceDeclarations ?? [], accessor.getter.element,
          ...(accessor.setter === undefined ? [] : [accessor.setter.element]),
        ])]),
        sourceTypes: Object.freeze([
          ...input.sourceTypes ?? [], accessor.getter.sourceSelectedType, accessor.getter.sourceElementType,
          ...(accessor.setter === undefined ? [] : [accessor.setter.sourceSelectedType, accessor.setter.sourceElementType]),
        ]),
      });
      accessors.push(Object.freeze({ accessor, index: matched?.index, input, output }));
      if (matched !== undefined && output !== undefined) projected[matched.index] = Object.freeze({ ...matched.member, proof: output });
    }
  }
  const output = projected === undefined ? undefined : Object.freeze(projected);
  const implementation = output === undefined ? undefined : selectCsharpObjectMethodImplementationSource(
    output.map(member => Object.freeze({ memberKind: member.memberKind, sourceDeclarations: member.proof.sourceDeclarations })),
    host, Object.freeze({ depth: 0 }), literal.objectLiteral);
  const captures = Object.freeze(implementation?.captures.map(capture => Object.freeze({
    node: capture.declaration, sourceFile: capture.sourceFile, state: Object.freeze(nextState(implementation.state)),
  })) ?? []);
  return Object.freeze({ literal, expected, actual, selected, additional, members, accessors: Object.freeze(accessors), output,
    nativeMethodLiteral, ownedMembers, implementation, captures });
}
