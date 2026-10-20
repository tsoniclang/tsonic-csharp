import type { Node, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpDelegateSignatureShape } from "../types/model.js";
export type CustomRegExpProtocolKind = "match" | "match-all" | "replace" | "search" | "split";
export interface CsharpCustomRegExpProtocol {
  readonly receiverType: TargetTypeRef;
  readonly memberTargetName: string;
  readonly signature: CsharpDelegateSignatureShape;
}
export interface CsharpSourceProfileInputRequirements {
  readonly regexpProtocol?: true;
  readonly objectShapes?: true;
}
export interface CsharpSourceProfileInputFacts {
  readonly numericArguments: ReadonlySet<Node>;
  readonly throwableCarriers: ReadonlySet<TargetTypeRef>;
  readonly callTypeArguments: readonly TargetTypeRef[] | undefined;
  readonly parameters: readonly (TargetTypeRef | undefined)[];
  readonly regexpProtocol: { readonly get: (index: number, kind: CustomRegExpProtocolKind) => CsharpCustomRegExpProtocol | undefined };
  readonly values: ReadonlyMap<Node, ReadonlyMap<Type, TargetTypeRef | undefined>>;
  readonly types: ReadonlyMap<Type, TargetTypeRef | undefined>;
  readonly nodes: ReadonlyMap<Node, TargetTypeRef | undefined>;
  readonly typeArguments: readonly { readonly node?: Node; readonly type: Type; readonly carrier?: TargetTypeRef }[];
  readonly resultType: TargetTypeRef | undefined;
}
