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
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";

export interface CsharpObjectShapeSemanticsHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
    resolver?: CsharpRecursiveTargetTypeResolver,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeRefForType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
    resolver?: CsharpRecursiveTargetTypeResolver,
  ) => TargetTypeRef | undefined;
  readonly getFunctionTargetTypeRefFromSignatureLikeSubject: (
    node: Node,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    resolver?: CsharpRecursiveTargetTypeResolver,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeArgumentsForType: (
    type: Type,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    resolver?: CsharpRecursiveTargetTypeResolver,
  ) => readonly TargetTypeRef[] | undefined;
}
