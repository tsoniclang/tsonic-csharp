import type { TargetTypeRef } from "../../types/model.js";
import type { ResolvedSourceResourceManagementInfo } from "@tsonic/tsts";

export interface CsharpResolvedResourceManagement {
  readonly kind: "resolved";
  readonly source: ResolvedSourceResourceManagementInfo;
  readonly registration:
    | {
        readonly kind: "direct";
        readonly resourceType: TargetTypeRef;
        readonly disposal: CsharpResourceDisposalOperation;
      }
    | {
        readonly kind: "runtime-union";
        readonly resourceType: TargetTypeRef;
        readonly arms: readonly CsharpResourceDisposalArm[];
      };
}

export interface CsharpResourceDisposalOperation {
  readonly kind: "sync" | "async";
  readonly targetName: "Dispose" | "DisposeAsync";
}

export interface CsharpResourceDisposalArm {
  readonly armIndex: number;
  readonly targetType: TargetTypeRef;
  readonly disposal: CsharpResourceDisposalOperation;
}
