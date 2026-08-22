import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpStorageIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpStorageClassifications {
  readonly issues: readonly CsharpStorageIssue[];
  readonly contracts: readonly CsharpStorageContractClassification[];
  type(node: Node): TargetTypeRef | undefined;
  requiredType(node: Node): TargetTypeRef | undefined;
  requiresTypedLocationIdentity(declaration: Node): boolean;
}

export interface CsharpStorageContractClassification {
  readonly declaration: Node;
  readonly targetType?: TargetTypeRef;
  readonly nullableWrittenType?: TargetTypeRef;
  readonly type: TargetTypeRef;
  readonly typedLocationIdentity: boolean;
}
