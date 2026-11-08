import type { TargetTypeRef } from "../../types/native-type-data.js";

export type CsharpPointerStoragePointeeSelection =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "unresolved"; readonly reason: string };
