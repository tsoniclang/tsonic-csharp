import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";

export interface CsharpObjectShapeSemanticsHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeRefForType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getFunctionTargetTypeRefFromSignatureLikeSubject: (
    node: Node,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeArgumentsForType: (
    type: Type,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => readonly TargetTypeRef[] | undefined;
}
