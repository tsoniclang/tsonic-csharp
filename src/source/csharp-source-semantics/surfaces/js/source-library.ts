import type {
  ExtensionDiagnostic,
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../../../csharp-facts.js";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
export type {
  SourceLibraryDeclaringName,
  SourceLibraryMember,
} from "../../source-library.js";
export {
  getSourceLibraryMember,
  getSourceLibraryMemberFromReceiverType,
  isSourceLibraryType,
} from "../../source-library.js";
export {
  csharpTargetOperationFromMember,
  csharpTargetIntrinsicOperatorOperation,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "../../operations.js";
export {
  asNodeSubject,
  asSemanticType as asType,
} from "../../../fact-subjects.js";

export {
  type CsharpTargetNamedTypeRef,
  csharpDelegateTargetType,
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetMethod,
  targetParameter,
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

export const csharpJsCheckedTypeQuery = { allowSemanticTypeQuery: false } satisfies CsharpJsTargetTypeRefResolutionOptions;

export function getSourceLibraryMemberFromTargetReceiverType(
  receiverType: TargetTypeRef | undefined,
  memberName: string | undefined,
  host: CsharpJsSurfaceHost,
): SourceLibraryMember | undefined {
  if (memberName === undefined || memberName === "") {
    return undefined;
  }
  const unwrapped = host.unwrapNullableTargetType(receiverType);
  if (host.isCsharpStringType(unwrapped)) {
    return { declaringName: "String", memberName };
  }
  if (unwrapped?.kind === "array") {
    return { declaringName: "Array", memberName };
  }
  return undefined;
}

export function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_value, index) => index);
}
