import type { Node, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
export interface CsharpSourceProfileInputFacts {
  readonly numericArguments: ReadonlySet<Node>;
  readonly values: ReadonlyMap<Node, ReadonlyMap<Type, TargetTypeRef | undefined>>;
  readonly types: ReadonlyMap<Type, TargetTypeRef | undefined>;
  readonly nodes: ReadonlyMap<Node, TargetTypeRef | undefined>;
  readonly typeArguments: readonly { readonly node?: Node; readonly type: Type; readonly carrier?: TargetTypeRef }[];
  readonly resultType: TargetTypeRef | undefined;
}
