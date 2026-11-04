import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

export interface CsharpUnionNodeMemberSource {
  readonly index: number;
  readonly node: Node | undefined;
  readonly type: Type | undefined;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
}

export type CsharpUnionTypeNodeSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-union" }
  | { readonly kind: "selected"; readonly type: Type;
      readonly child: { readonly type: Type; readonly sourceFile: SourceFile; readonly state: CsharpTypeResolutionState } }
  | { readonly kind: "members"; readonly type: Type | undefined; readonly syntaxMembers: readonly (Node | undefined)[];
      readonly checkedMembers: readonly (Type | undefined)[]; readonly members: readonly CsharpUnionNodeMemberSource[] }
);

export function formCsharpUnionTypeNodeSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpUnionTypeNodeSource {
  if (!host.ast.is.IsUnionTypeNode(node)) return Object.freeze({ kind: "not-union", node, queries, state });
  const type = queries.types.authoredType(node);
  if (type !== undefined && (queries.types.isAny(type) || queries.types.isUnknown(type))) {
    return Object.freeze({ kind: "selected", node, queries, state, type,
      child: Object.freeze({ type, sourceFile: queries.sourceFile, state: Object.freeze(nextState(state)) }) });
  }
  const syntaxMembers = host.ast.children(node);
  const checkedMembers = Object.freeze(Array.from(syntaxMembers,
    member => member === undefined ? undefined : queries.types.authoredType(member)));
  const members = Object.freeze(Array.from(syntaxMembers, (member, index) => Object.freeze({ index, node: member,
    type: checkedMembers[index], sourceFile: queries.sourceFile, state: Object.freeze(nextState(state)) })));
  return Object.freeze({ kind: "members", node, queries, state, type, syntaxMembers, checkedMembers, members });
}

export function assertCsharpUnionTypeNodeSource(source: CsharpUnionTypeNodeSource): void {
  if (source === undefined || source.node === undefined || source.queries === undefined || source.state === undefined ||
      source.kind !== "not-union" && source.kind !== "selected" && source.kind !== "members") {
    return failTargetAnalysisInvariant("tsonic-csharp", "A union-type node requires its exact retained Source children.", source?.node);
  }
  if (source.kind === "not-union") return;
  if (!Object.prototype.hasOwnProperty.call(source, "type")) return failTargetAnalysisInvariant("tsonic-csharp",
    "A union-type node requires its exact retained Source children.", source.node);
  const sameState = (state: CsharpTypeResolutionState | undefined): boolean => state !== undefined &&
    state.depth === source.state.depth + 1 && state.sourceBindings === source.state.sourceBindings &&
    state.sourceStorageBindings === source.state.sourceStorageBindings && state.sourceStorageSubject === source.state.sourceStorageSubject &&
    state.rejectNativeResolution === source.state.rejectNativeResolution;
  if (source.kind === "selected") {
    if (source.type === undefined || source.child === undefined || source.child.type !== source.type ||
        source.child.sourceFile !== source.queries.sourceFile || !sameState(source.child.state)) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A union-type node requires its exact retained Source children.", source.node);
    }
    return;
  }
  if (source.syntaxMembers === undefined || source.checkedMembers === undefined || source.members === undefined ||
      source.syntaxMembers.length !== source.checkedMembers.length || source.members.length !== source.syntaxMembers.length) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A union-type node requires its exact retained Source children.", source.node);
  }
  for (let index = 0; index < source.syntaxMembers.length; index += 1) {
    const member = source.members[index];
    if (!Object.prototype.hasOwnProperty.call(source.syntaxMembers, index) ||
        !Object.prototype.hasOwnProperty.call(source.checkedMembers, index) || member === undefined || member.index !== index ||
        member.node !== source.syntaxMembers[index] || member.type !== source.checkedMembers[index] ||
        member.sourceFile !== source.queries.sourceFile || !sameState(member.state)) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A union-type node requires its exact retained Source children.", source.node);
    }
  }
}
