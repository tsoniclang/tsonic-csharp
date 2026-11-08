import type { TargetTypeRef } from "./native-type-data.js";
import type { TargetBindingFact } from "./model.js";
import type { CsharpNativeDeclarationQueries } from "./native-declarations.js";

export interface CsharpTypeDefinitions extends CsharpNativeDeclarationQueries {
  nativeDeclarationKind(carrier: TargetTypeRef): TargetBindingFact["kind"] | undefined;
  nativeSupertypes(carrier: TargetTypeRef): readonly TargetTypeRef[] | undefined;
}

export const emptyCsharpTypeDefinitions: CsharpTypeDefinitions = Object.freeze({
  nativeDeclaration: () => undefined,
  nativeDeclarationKind: () => undefined,
  nativeSupertypes: () => undefined,
});
