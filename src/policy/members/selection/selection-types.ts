import type {
  Node,
  Type,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type {
  CsharpProviderTargetRelation,
  CsharpTargetReceiverRelation,
} from "../../../providers/relations/index.js";
import type {
  CsharpConversionSelection,
} from "../../conversions/index.js";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../types/index.js";

export type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["call"]>
>;

export interface CsharpSelectedCallArgument {
  readonly sourceArgumentIndex: number;
  readonly effectiveArgumentIndex: number;
  readonly sourceForm: "value" | "spread-element" | "spread-sequence";
  readonly spreadElementIndex?: number;
  readonly targetParameterIndex: number;
  readonly targetParameter: CsharpTargetParameter;
}

interface CsharpSelectedTargetCallBase {
  readonly targetMember: CsharpTargetMember;
  readonly receiver: CsharpTargetReceiverRelation;
  readonly targetMethodTypeArguments: readonly CsharpSelectedTargetMethodTypeArgument[];
  readonly targetInvocationTypeArguments: readonly CsharpSelectedTargetMethodTypeArgument[];
  readonly arguments: readonly CsharpSelectedCallArgument[];
}

export type CsharpProviderArgumentMapping =
  | {
      readonly kind: "by-value";
      readonly effectiveArgumentIndex: number;
      readonly sourceType: TargetTypeRef;
      readonly targetType: TargetTypeRef;
      readonly conversion: CsharpConversionSelection;
    }
  | {
      readonly kind: "by-reference";
      readonly effectiveArgumentIndex: number;
      readonly sourceType: TargetTypeRef;
      readonly targetType: TargetTypeRef;
      readonly passingMode: Exclude<
        CsharpTargetParameter["passingMode"],
        "by-value"
      >;
      readonly proof: "storage-identity";
    };

export type CsharpSelectedTargetCall =
  | CsharpSelectedTargetCallBase & {
      readonly origin: "provider";
      readonly relation: Extract<
        CsharpProviderTargetRelation,
        { readonly kind: "signature" }
      >;
      readonly argumentMappings: readonly CsharpProviderArgumentMapping[];
    }
  | CsharpSelectedTargetCallBase & {
      readonly origin: "source-profile";
    };

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
