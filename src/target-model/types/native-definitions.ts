import type { TargetTypeRef } from "./native-type-data.js";
import type { TargetBindingFact } from "./model.js";

export interface CsharpTypeDefinitions {
  nativeDeclarationKind(carrier: TargetTypeRef): TargetBindingFact["kind"] | undefined;
  nativeSupertypes(carrier: TargetTypeRef): readonly TargetTypeRef[] | undefined;
}

export const emptyCsharpTypeDefinitions: CsharpTypeDefinitions = Object.freeze({
  nativeDeclarationKind: () => undefined,
  nativeSupertypes: () => undefined,
});
