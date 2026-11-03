import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpDeclaredObjectReceiverContextSource } from "../../../../target-model/records/native/native-value-carriers.js";
import type { CsharpObjectMemberDeclarationSource } from "../../../../target-model/records/objects/member-declarations.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { formCsharpObjectMemberDeclarationSource } from "../../../objects/shapes/member-declaration-source.js";

export type CsharpDeclaredObjectReceiverTypeSource = {
  readonly node: Node;
  readonly context: CsharpDeclaredObjectReceiverContextSource;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "unavailable"; readonly type: undefined }
  | { readonly kind: "type"; readonly type: Type;
      readonly members: readonly TypePropertyInfo[];
      readonly declarations: readonly (CsharpObjectMemberDeclarationSource | undefined)[] }
);

export interface CsharpDeclaredObjectReceiverInput {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly context: CsharpDeclaredObjectReceiverContextSource;
  readonly source: CsharpDeclaredObjectReceiverTypeSource | undefined;
}

export function formCsharpDeclaredObjectReceiverInput(
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "semanticsFor">,
  input: {
    readonly node: Node;
    readonly queries: SourceFileSemantics;
    readonly state: CsharpTypeResolutionState;
    readonly context: CsharpDeclaredObjectReceiverContextSource;
    readonly selectedType: Type | undefined;
  },
): CsharpDeclaredObjectReceiverInput {
  const { node, queries, state, context, selectedType } = input;
  if (host.ast.kindName(node) !== "KindThisKeyword" && !host.ast.is.IsThisTypeNode(node)) {
    return Object.freeze({ node, queries, state, context, source: undefined });
  }
  const source: CsharpDeclaredObjectReceiverTypeSource = selectedType === undefined
    ? Object.freeze({ kind: "unavailable", node, queries, state, context, type: undefined })
    : Object.freeze({ kind: "type", node, queries, state, context, type: selectedType,
        ...formMembers(host, selectedType, queries, context.receiver.self.declaration),
      });
  return Object.freeze({ node, queries, state, context, source });
}

function formMembers(
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "semanticsFor">,
  type: Type,
  queries: SourceFileSemantics,
  literal: Node,
): Pick<Extract<CsharpDeclaredObjectReceiverTypeSource, { readonly kind: "type" }>, "members" | "declarations"> {
  const members = queries.types.propertyInfos(type);
  return Object.freeze({ members, declarations: Object.freeze(members.map(property =>
    formCsharpObjectMemberDeclarationSource(host, property, queries, literal))) });
}
