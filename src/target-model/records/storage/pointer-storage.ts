import type { TargetTypeRef } from "../../types/model.js";

export type CsharpPointerStoragePointeeSelection =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "unresolved"; readonly reason: string };
