import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "../target-type-resolution-host.js";

export type CsharpTargetTypeResolver = (
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
) => TargetTypeRef | undefined;

export type CsharpTargetTypeSubjectResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
) => TargetTypeRef | undefined;
