import type { Node, ResolvedSourceElementAccessInfo, ResolvedSourcePropertyAccessInfo, Type, TypePropertyInfo } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpDeclaredObjectReceiverContextSource } from "../../../../target-model/records/native/native-value-carriers.js";
import type { CsharpObjectMemberDeclarationSource } from "../../../../target-model/records/objects/member-declarations.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { formCsharpObjectShapePropertySource } from "../../../objects/shapes/member-evidence.js";
import type { CsharpStructuralPropertyApplication } from "./structural-applications.js";
import { formCsharpDeclaredReceiverBodyMembers, formCsharpDeclaredReceiverMemberStorage,
  type CsharpDeclaredReceiverBodyMemberSource, type CsharpDeclaredReceiverMemberStorageSource } from "./declared-receiver-body.js";

export interface CsharpDeclaredObjectReceiverMemberSource {
  readonly kind: "declared-member";
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly context: CsharpDeclaredObjectReceiverContextSource;
  readonly access: ResolvedSourcePropertyAccessInfo | ResolvedSourceElementAccessInfo;
  readonly declaration: CsharpObjectMemberDeclarationSource;
  readonly storage: CsharpDeclaredReceiverMemberStorageSource;
  readonly property: CsharpStructuralPropertyApplication;
  readonly read: {
    readonly type: Type;
    readonly declaredTypeIdentical: boolean;
    readonly related: boolean;
    readonly absent: boolean;
    readonly state: CsharpTypeResolutionState;
  } | undefined;
}

export type CsharpDeclaredObjectReceiverTypeSource = {
  readonly node: Node;
  readonly context: CsharpDeclaredObjectReceiverContextSource;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly members: readonly TypePropertyInfo[];
  readonly declarations: readonly (CsharpObjectMemberDeclarationSource | undefined)[];
  readonly body: readonly CsharpDeclaredReceiverBodyMemberSource[];
} & (
  | { readonly kind: "unavailable"; readonly type: undefined }
  | { readonly kind: "type"; readonly type: Type }
);

export interface CsharpDeclaredObjectReceiverInput {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly context: CsharpDeclaredObjectReceiverContextSource;
  readonly source: CsharpDeclaredObjectReceiverTypeSource | undefined;
  readonly member: CsharpDeclaredObjectReceiverMemberSource | undefined;
}

export function formCsharpDeclaredObjectReceiverInput(
  host: CsharpTypePolicyBaseHost,
  input: {
    readonly node: Node;
    readonly queries: SourceFileSemantics;
    readonly state: CsharpTypeResolutionState;
    readonly context: CsharpDeclaredObjectReceiverContextSource;
    readonly selectedType: Type | undefined;
  },
): CsharpDeclaredObjectReceiverInput {
  const { node, queries, state, context, selectedType } = input;
  const member = formCsharpDeclaredObjectReceiverMemberSource(host, {
    node, queries, state, context, selectedType: undefined,
  });
  if (host.ast.kindName(node) !== "KindThisKeyword" && !host.ast.is.IsThisTypeNode(node)) {
    return Object.freeze({ node, queries, state, context, source: undefined, member });
  }
  const declared = { node, queries, state, context,
    members: context.receiver.members, declarations: context.receiver.declaredMembers,
    body: formCsharpDeclaredReceiverBodyMembers(host, context, state) };
  const source: CsharpDeclaredObjectReceiverTypeSource = selectedType === undefined
    ? Object.freeze({ ...declared, kind: "unavailable", type: undefined })
    : Object.freeze({ ...declared, kind: "type", type: selectedType });
  return Object.freeze({ node, queries, state, context, source, member });
}

export function formCsharpDeclaredObjectReceiverMemberSource(
  host: CsharpTypePolicyBaseHost,
  input: {
    readonly node: Node;
    readonly queries: SourceFileSemantics;
    readonly state: CsharpTypeResolutionState;
    readonly context: CsharpDeclaredObjectReceiverContextSource;
    readonly selectedType: Type | undefined;
  },
): CsharpDeclaredObjectReceiverMemberSource | undefined {
  const { node, queries, state, context, selectedType } = input;
  const access = host.ast.is.IsPropertyAccessExpression(node) ? queries.operations.propertyAccess(node)
    : host.ast.is.IsElementAccessExpression(node) ? queries.operations.elementAccess(node) : undefined;
  if (access === undefined || host.ast.kindName(access.receiver.expression) !== "KindThisKeyword") return undefined;
  const declarations = context.receiver.declaredMembers.filter((member): member is CsharpObjectMemberDeclarationSource =>
    member !== undefined && (access.selectedSymbol !== undefined &&
      (member.property.symbol === access.selectedSymbol || member.property.rootSymbols.includes(access.selectedSymbol)) ||
      access.selectedDeclaration !== undefined && member.declarations.includes(access.selectedDeclaration)));
  if (declarations.length !== 1) return undefined;
  const declaration = declarations[0]!;
  if (declaration.method || declaration.getters.length !== 0 || declaration.setters.length !== 0) return undefined;
  const storage = formCsharpDeclaredReceiverMemberStorage(host, declaration, state);
  const type = selectedType ?? access.sourceReadType ?? access.sourceWriteType;
  const declaredType = type === undefined ? undefined : queries.types.typeOfSymbol(access.selectedSymbol);
  return Object.freeze({ kind: "declared-member", node, queries, state, context, access, declaration, storage,
    property: formCsharpObjectShapePropertySource(host, declaration.property, declaration.propertyType, queries, storage.state),
    read: type === undefined ? undefined : Object.freeze({ type,
      declaredTypeIdentical: declaredType !== undefined && queries.types.relationship(declaredType, type) === "identical",
      related: queries.types.relationship(declaration.propertyType, type) !== "unrelated",
      absent: queries.types.isNullish(type) && access.sourceReadType !== undefined && queries.types.isNullish(access.sourceReadType),
      state: Object.freeze({ depth: 0 }),
    }),
  });
}
