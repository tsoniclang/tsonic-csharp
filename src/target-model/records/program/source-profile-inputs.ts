import type { Node, Type } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../types/model.js";
import type { CsharpDelegateSignatureShape } from "../../types/model.js";
import type { CsharpCallArgumentProjection } from "../objects/members.js";
export type CustomRegExpProtocolKind = "match" | "match-all" | "replace" | "search" | "split";
export interface CsharpSourceProfileTypeArgumentSource {
  readonly explicitTypeNode?: Node;
  readonly selectedType: Type;
  readonly typeParameter?: Type;
}
export interface CsharpCustomRegExpProtocol {
  readonly receiverType: TargetTypeRef;
  readonly memberTargetName: string;
  readonly signature: CsharpDelegateSignatureShape;
}
export interface CsharpSourceProfileInputRequirements {
  readonly errorCause?: true;
  readonly regexpProtocol?: true;
  readonly regexpExecution?: true;
  readonly sourceTypeRelations?: true;
  readonly objectShapes?: true;
}
export interface CsharpSourceProfileInputFacts {
  readonly errorCause?: { readonly kind: "resolved"; readonly projection: CsharpCallArgumentProjection }
    | { readonly kind: "unresolved"; readonly reason: string };
  readonly numberLikeTypes: ReadonlySet<Type>;
  readonly identicalTypes: ReadonlyMap<Type, ReadonlySet<Type>>;
  readonly nativeRegExpReceivers: ReadonlySet<Node>;
  readonly numericArguments: ReadonlySet<Node>;
  readonly throwableCarriers: ReadonlySet<TargetTypeRef>;
  readonly callTypeArguments: readonly TargetTypeRef[] | undefined;
  readonly parameters: readonly (TargetTypeRef | undefined)[];
  readonly regexpProtocol: { readonly get: (index: number, kind: CustomRegExpProtocolKind) => CsharpCustomRegExpProtocol | undefined };
  readonly values: ReadonlyMap<Node, TargetTypeRef | undefined>;
  readonly results: { readonly get: (node: Node | undefined) => TargetTypeRef | undefined };
  readonly nodes: { readonly get: (node: Node | undefined) => TargetTypeRef | undefined };
  readonly typeArgument: { readonly get: (source: CsharpSourceProfileTypeArgumentSource) => TargetTypeRef | undefined };
  readonly objectShape: { readonly get: (node: Node | undefined) => CsharpObjectShapeFact | undefined };
  readonly typeArguments: readonly { readonly source: CsharpSourceProfileTypeArgumentSource; readonly node?: Node; readonly type: Type; readonly carrier?: TargetTypeRef; readonly parameter?: TargetTypeRef }[];
}
