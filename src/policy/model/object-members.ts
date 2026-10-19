import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import type { CsharpNativeObjectField } from "../../target-model/records/storage.js";

export interface CsharpObjectMemberPolicyInput {
  readonly shape: CsharpObjectShapeFact;
  readonly member: CsharpObjectShapeMemberFact;
  readonly receiverBound: boolean;
  readonly authored: boolean;
  readonly deferred: boolean;
  readonly implementsInterface: boolean;
  readonly nativeField: CsharpNativeObjectField | undefined;
}
