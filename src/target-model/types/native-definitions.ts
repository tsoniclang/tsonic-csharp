import type { TargetBindingFact, TargetTypeRef } from "./model.js";

export interface CsharpTypeDefinitions {
  nativeDeclarationKind(carrier: TargetTypeRef): TargetBindingFact["kind"] | undefined;
  nativeSupertypes(carrier: TargetTypeRef): readonly TargetTypeRef[] | undefined;
}

export const emptyCsharpTypeDefinitions: CsharpTypeDefinitions = Object.freeze({
  nativeDeclarationKind: () => undefined,
  nativeSupertypes: () => undefined,
});
