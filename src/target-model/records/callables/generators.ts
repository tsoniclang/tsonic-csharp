import type { Node } from "@tsonic/tsts";
import type { CsharpGeneratorProtocol, TargetTypeRef } from "../../types/model.js";

export interface CsharpGeneratorFact extends CsharpGeneratorProtocol {
  readonly resultCarrier: TargetTypeRef;
  readonly iteratorCarrier: TargetTypeRef;
  readonly hasExplicitReturn: boolean;
}

export type CsharpYieldFact = {
  readonly generatorDeclaration: Node;
  readonly operand: Node | undefined;
} & (
  | { readonly kind: "value" }
  | { readonly kind: "delegate"; readonly operand: Node; readonly delegatedCarrier: TargetTypeRef;
      readonly protocol: CsharpGeneratorProtocol; readonly resultCarrier: TargetTypeRef }
);

export interface CsharpGeneratorRecords {
  readonly generator: { readonly get: (subject: Node | undefined) => CsharpGeneratorFact | undefined };
  readonly yield: { readonly get: (subject: Node | undefined) => CsharpYieldFact | undefined };
}
