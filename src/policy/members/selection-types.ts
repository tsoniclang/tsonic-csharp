import type {
  Node,
  Type,
} from "@tsonic/tsts";
import type {
  SourceFileSemantics,
} from "@tsonic/target-api";
import type {
  CsharpTargetReceiverRelation,
} from "../../provider/target-relations/index.js";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../types/index.js";

export type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedCallInfo"]>
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
  readonly targetMethodTypeArguments: readonly CsharpSelectedTargetMethodTypeArgument[];
  readonly arguments: readonly CsharpSelectedCallArgument[];
}

export type CsharpSelectedTargetMethodTypeArgument =
  | {
      readonly kind: "target-derived";
      readonly targetType: TargetTypeRef;
    }
  | {
      readonly kind: "selected-source";
      readonly targetType: TargetTypeRef;
      readonly selectedType: Type;
      readonly explicitTypeNode?: Node;
    };

export type CsharpTargetElementInvocation =
  | { readonly kind: "indexer" }
  | {
      readonly kind: "method";
      readonly targetName: string;
      readonly appendInt32Literal?: number;
    };
