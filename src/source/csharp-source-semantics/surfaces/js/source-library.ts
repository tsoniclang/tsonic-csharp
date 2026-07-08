import type {
  ExtensionDiagnostic,
  ExtensionEvidence,
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
  SourceLibraryDeclaringKey,
  SourceLibraryMember,
  SourceLibraryMemberKey,
  SourceLibraryMemberIdentityPolicy,
  SourceLibraryMemberKeyPrefix,
} from "../../source-library.js";
export {
  createSourceLibraryMember,
  isBundledStandardLibraryType,
  resolveSourceLibraryMemberIdentity,
  resolveSelectedSourceLibraryMemberIdentity,
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
  sourceLibraryMemberMatchesAny,
  sourceLibraryMemberMatchesAnyPrefix,
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
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpReadOnlyListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  isCsharpValueTypeTargetType,
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
      readonly argumentTargetTypes?: readonly (TargetTypeRef | undefined)[];
      readonly receiver?: ExtensionFactSubject;
      readonly receiverTargetType?: TargetTypeRef;
      readonly sourceSelectedSignature?: unknown;
      readonly sourceSelectedIdentity?: string;
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
    evidence?: readonly ExtensionEvidence[],
    nodeOrSpan?: unknown,
  ) => ExtensionDiagnostic;
}

export const csharpJsCheckedTypeQuery = { allowSemanticTypeQuery: true } satisfies CsharpJsTargetTypeRefResolutionOptions;

export function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_value, index) => index);
}
