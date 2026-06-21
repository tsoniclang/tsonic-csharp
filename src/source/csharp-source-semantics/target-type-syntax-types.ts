import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";

export interface CsharpRecursiveTargetTypeResolver {
  readonly resolveSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    host: CsharpTargetTypeResolutionHost,
  ) => TargetTypeRef | undefined;
  readonly resolveType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    host: CsharpTargetTypeResolutionHost,
  ) => TargetTypeRef | undefined;
}
