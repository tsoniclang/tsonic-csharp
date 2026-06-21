import type {
  ExtensionDiagnostic,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetMember,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../../../csharp-facts.js";
import {
  asNodeSubject,
} from "../../../fact-subjects.js";
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
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
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

export interface SourceLibraryMember {
  readonly declaringName: SourceLibraryDeclaringName;
  readonly memberName: string;
}

export const csharpJsCheckedTypeQuery = { allowSemanticTypeQuery: false } satisfies CsharpJsTargetTypeRefResolutionOptions;

export type SourceLibraryDeclaringName = "Array" | "ReadonlyArray" | "String" | "RegExp" | "Math";

export function getSourceLibraryMember(
  declarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  const ast = context.compiler?.ast;
  const declaration = asNodeSubject(declarationSubject);
  if (ast === undefined || declaration === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(declaration);
  const fileName = ast.getFileName(sourceFile);
  if (!isTstsBundledStandardLibraryFile(fileName)) {
    return undefined;
  }
  const containerName = ast.text(ast.name(ast.parent(declaration)));
  const declaringName = sourceLibraryDeclaringName(containerName);
  const memberName = ast.text(ast.name(declaration)) || sourceLibraryConstructorMemberName(containerName);
  return memberName === undefined || memberName === "" || declaringName === undefined
    ? undefined
    : { declaringName, memberName };
}

export function isSourceLibraryType(type: Type, context: ExtensionObservationContext, name: string): boolean {
  const ast = context.compiler?.ast;
  const types = context.compiler?.types;
  if (ast === undefined || types === undefined) {
    return false;
  }
  const target = types.isTypeReference(type) ? types.getTypeReferenceTarget(type) : type;
  const declarations = (target?.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    [];
  return declarations.some((declaration) =>
    ast.text(ast.name(declaration)) === name &&
    ast.getFileName(ast.getSourceFile(declaration)).startsWith("bundled:///libs/"));
}

export function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_value, index) => index);
}

function sourceLibraryDeclaringName(name: string): SourceLibraryDeclaringName | undefined {
  const normalized = name.endsWith("Constructor") ? name.slice(0, -"Constructor".length) : name;
  return isSourceLibraryDeclaringName(normalized) ? normalized : undefined;
}

function sourceLibraryConstructorMemberName(name: string): "constructor" | undefined {
  return name === "RegExpConstructor" ? "constructor" : undefined;
}

function isSourceLibraryDeclaringName(name: string): name is SourceLibraryDeclaringName {
  return name === "Array" ||
    name === "ReadonlyArray" ||
    name === "String" ||
    name === "RegExp" ||
    name === "Math";
}

function isTstsBundledStandardLibraryFile(fileName: string): boolean {
  return fileName.startsWith("bundled:///libs/");
}
