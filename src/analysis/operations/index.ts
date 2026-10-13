export { analyzeCsharpTargetOperations } from "./analyze.js";
export type { CsharpSwitchSelection } from "../../target-model/records/switch.js";
export type { CsharpTypedArrayMutation, CsharpTypedArrayUpdate } from "../../target-model/records/typed-array-mutations.js";
export type { CsharpCallClassification, CsharpMemberReceiverProjection, CsharpBinaryClassification, CsharpConstructionClassification, CsharpElementClassification, CsharpPropertyClassification, CsharpSourceCallArgumentClassification, CsharpUnaryClassification, CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
export type { CsharpForAwaitOfIteration, CsharpForOfIteration } from "../../policy/operations/index.js";
export type { CsharpResolvedBinaryOperation } from "../../target-model/records/operator-selection.js";
export type { CsharpResolvedIteration } from "../../target-model/records/selection.js";
export type { CsharpResolvedResourceManagement, CsharpResourceDisposalArm, CsharpResourceDisposalOperation } from "../../target-model/records/management.js";
export type { CsharpTypedLocationOperationKind } from "../../target-model/records/typed-locations.js";
export type { CsharpTypedLocationStorage } from "../../target-model/records/typed-location-storage.js";
export type { CsharpProviderArgumentMapping, CsharpSelectedCallArgument, CsharpSelectedTargetCall, ResolvedSourceCallInfo } from "../../target-model/records/members.js";
export type { CsharpTargetCallSelection, CsharpTargetElementSelection, CsharpTargetPropertySelection } from "../../target-model/records/member-selections.js";
export type { CsharpJsValueOperationSelection } from "../../target-model/operations/js-values.js";
export {
  isCsharpIndexKeyIteration,
  isCsharpKeyCollectionIteration,
  isCsharpObjectShapeKeyIteration,
  isCsharpStringCodePointIteration,
} from "../../policy/operations/index.js";
