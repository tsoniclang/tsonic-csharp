import type {
  SourceFileQueries,
} from "@tsonic/tsts";
import type {
  CsharpTargetReceiverRelation,
} from "../../provider/target-relations/index.js";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../types/index.js";

export type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileQueries["checker"]["getResolvedCallInfo"]>
>;

export interface CsharpSelectedCallArgument {
  readonly sourceArgumentIndex: number;
  readonly effectiveArgumentIndex: number;
  readonly sourceForm: "value" | "spread-element" | "spread-sequence";
  readonly spreadElementIndex?: number;
  readonly targetParameterIndex: number;
  readonly targetParameter: CsharpTargetParameter;
}

export interface CsharpSelectedTargetCall {
  readonly origin: "provider" | "source-profile";
  readonly targetMember: CsharpTargetMember;
  readonly receiver: CsharpTargetReceiverRelation;
  readonly targetMethodTypeArguments: readonly TargetTypeRef[];
  readonly arguments: readonly CsharpSelectedCallArgument[];
}

export type CsharpTargetElementInvocation =
  | { readonly kind: "indexer" }
  | {
      readonly kind: "method";
      readonly targetName: string;
      readonly appendInt32Literal?: number;
    };
