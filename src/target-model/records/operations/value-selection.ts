import type { CsharpProviderTargetRelation } from "../../identities/provider-relations.js";

export type CsharpProviderValueSelection =
  | {
      readonly kind: "resolved";
      readonly relation: CsharpProviderValueRelation;
    }
  | {
      readonly kind: "not-provider";
    }
  | {
      readonly kind: "missing" | "conflict" | "ambiguous";
      readonly reason: string;
    };

export type CsharpProviderValueRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "value" }
>;
