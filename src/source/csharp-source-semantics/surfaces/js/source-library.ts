import type {
  ExtensionDiagnostic,
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetMember,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../../../csharp-facts.js";
import type {
  CsharpTargetEnrichmentHost,
} from "../../target-enrichment.js";
export type {
  SourceLibraryDeclaringName,
  SourceLibraryMember,
} from "../../source-library.js";
export {
  getSourceLibraryMember,
  isSourceLibraryType,
} from "../../source-library.js";
export {
  csharpTargetOperationFromMember,
  csharpTargetIntrinsicOperatorOperation,
  csharpTargetMemberOperation,
  recordCsharpTargetMutationOperation,
  recordCsharpTargetOperation,
  targetOperation,
  targetOperationFromMember,
} from "../../operations.js";
export {
  asNodeSubject,
  asSemanticType as asType,
} from "../../../fact-subjects.js";

export {
  type CsharpTargetNamedTypeRef,
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpListTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpReadOnlyListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "../../target-types.js";

export interface CsharpJsTargetTypeRefResolutionOptions {
  readonly allowRuntimeCarrier?: boolean;
  readonly allowSemanticTypeQuery?: boolean;
  readonly sourceFile?: SourceFile;
}

export interface CsharpJsSurfaceHost {
  readonly targetId: string;
  readonly extensionId: string;
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: CsharpJsTargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getCsharpTargetBindingByTargetId?: CsharpTargetEnrichmentHost["getCsharpTargetBindingByTargetId"];
  readonly getCsharpTargetBindingByMetadataName?: CsharpTargetEnrichmentHost["getCsharpTargetBindingByMetadataName"];
  readonly unwrapNullableTargetType: (type: TargetTypeRef | undefined) => TargetTypeRef | undefined;
  readonly isCsharpStringType: (type: TargetTypeRef | undefined) => boolean;
  readonly isIntegralTargetTypeRef: (type: TargetTypeRef | undefined) => boolean;
  readonly isLiteralRepresentableAsTargetType: (
    expected: TargetTypeRef,
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => boolean;
  readonly selectTargetMember: (
    candidates: readonly TargetMember[],
    request: {
      readonly arguments: readonly ExtensionFactSubject[];
      readonly receiver?: ExtensionFactSubject;
    },
    context: ExtensionObservationContext,
    options?: {
      readonly declaringTargetType?: TargetTypeRef;
      readonly declaringTypeParameters?: readonly TargetTypeParameter[];
    },
  ) => TargetMember | undefined;
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly csharpProviderDiagnostic: (
    extensionId: string,
    extensionCode: string,
    numericCode: number,
    message: string,
  ) => ExtensionDiagnostic;
}

export const csharpJsCheckedTypeQuery = { allowSemanticTypeQuery: true } satisfies CsharpJsTargetTypeRefResolutionOptions;

export function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_value, index) => index);
}
