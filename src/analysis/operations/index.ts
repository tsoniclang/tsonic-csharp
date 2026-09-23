export { analyzeCsharpTargetOperations } from "./analyze.js";
export type { CsharpSwitchSelection } from "../../policy/operations/control-flow/switch.js";
export type { CsharpTypedArrayMutation, CsharpTypedArrayUpdate } from "../../policy/operations/collections/typed-array-mutations.js";
export type {
  CsharpCallClassification,
  CsharpBinaryClassification,
  CsharpConstructionClassification,
  CsharpElementClassification,
  CsharpPropertyClassification,
  CsharpSourceCallArgumentClassification,
  CsharpUnaryClassification,
  CsharpTargetOperationClassifications,
} from "./model.js";
export type {
  CsharpForAwaitOfIteration,
  CsharpForOfIteration,
  CsharpResolvedBinaryOperation,
  CsharpResolvedIteration,
  CsharpResolvedResourceManagement,
  CsharpResourceDisposalArm,
  CsharpResourceDisposalOperation,
  CsharpTypedLocationOperationKind,
  CsharpTypedLocationStorage,
} from "../../policy/operations/index.js";
export type {
  CsharpProviderArgumentMapping,
  CsharpSelectedCallArgument,
  CsharpSelectedTargetCall,
  CsharpTargetCallSelection,
  CsharpTargetElementSelection,
  CsharpTargetPropertySelection,
  ResolvedSourceCallInfo,
} from "../../policy/members/index.js";
export type {
  CsharpJsValueOperationSelection,
} from "../../policy/js-value-operations/index.js";
export {
  isCsharpIndexKeyIteration,
  isCsharpKeyCollectionIteration,
  isCsharpObjectShapeKeyIteration,
  isCsharpStringCodePointIteration,
} from "../../policy/operations/index.js";
