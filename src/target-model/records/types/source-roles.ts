import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef, CsharpRepresentedTypeParameter, CsharpOptionalStorageLayout } from "../../types/native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "../../types/model.js";

export interface CsharpSourceRoleEmission {
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly interfaces: readonly TargetTypeRef[];
  readonly storage: TargetTypeRef;
  readonly value: TargetTypeRef;
  readonly storageSlots: readonly TargetTypeRef[];
  readonly valueSlots: readonly TargetTypeRef[];
  readonly valueToStorage: readonly number[];
  readonly storageOptional: CsharpOptionalStorageLayout | undefined;
  readonly valueOptional: CsharpOptionalStorageLayout | undefined;
  readonly parameters: readonly CsharpRepresentedTypeParameter[];
  readonly site: Node;
}

export interface CsharpSourceRoleEmissionRecords {
  readonly sourceRoles: { readonly get: () => readonly CsharpSourceRoleEmission[] };
}
