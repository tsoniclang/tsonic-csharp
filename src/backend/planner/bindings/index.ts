export * from "./planning.js";
export {
  allocateCatchValue,
  allocateControlLabel,
  allocateForInNames,
  allocateForOfItem,
  allocateGeneratorNames,
  allocateGeneratorDelegationNames,
  allocateResourceScopeNames,
  allocateStringIterationNames,
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  createNestedPlannerState,
  declareCsharpLocalBindingName,
  declareCsharpTypedLocationIdentityName,
  getCsharpLocalBindingName,
  getCsharpTypedLocationIdentityName,
} from "./binding-state.js";
export { planBindingPatternFromExpression } from "./binding-patterns.js";
export type {
  ControlLabelTarget,
  DestructuringPlannerState,
} from "./binding-state.js";
