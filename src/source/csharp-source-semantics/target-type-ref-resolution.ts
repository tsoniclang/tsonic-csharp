import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";

export interface TargetTypeRefResolutionOptions {
  readonly allowRuntimeCarrier?: boolean;
  readonly allowSemanticTypeQuery?: boolean;
  readonly sourceFile?: SourceFile;
}

export type TargetTypeRefResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options?: TargetTypeRefResolutionOptions,
) => TargetTypeRef | undefined;
