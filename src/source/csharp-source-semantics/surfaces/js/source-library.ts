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
export { targetOperation } from "../../operations.js";

export {
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
  readonly declaringName: string;
  readonly memberName: string;
  readonly fileName: string;
}

export const csharpJsCheckedTypeQuery = { allowSemanticTypeQuery: false } satisfies CsharpJsTargetTypeRefResolutionOptions;

export function getSourceLibraryMember(
  declarationSubject: ExtensionFactSubject | undefined,
  checkedMemberName: string | undefined,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  const ast = context.compiler?.ast;
  const declaration = asNodeSubject(declarationSubject);
  if (ast === undefined || declaration === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(declaration);
  const fileName = ast.getFileName(sourceFile);
  if (!fileName.startsWith("bundled:///libs/")) {
    return undefined;
  }
  const containerName = ast.text(ast.name(ast.parent(declaration)));
  const memberName = ast.text(ast.name(declaration)) ||
    checkedMemberName ||
    (containerName.endsWith("Constructor") ? "constructor" : undefined);
  return memberName === undefined || memberName === "" || containerName === ""
    ? undefined
    : { declaringName: normalizeSourceLibraryDeclaringName(containerName), memberName, fileName };
}

export function getSourceLibraryMemberFromReceiver(
  receiver: ExtensionFactSubject | undefined,
  memberName: string | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): SourceLibraryMember | undefined {
  if (memberName === undefined || memberName.length === 0) {
    return undefined;
  }
  const receiverType = host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(receiver, context, csharpJsCheckedTypeQuery));
  if (receiverType?.kind === "array") {
    return sourceLibraryMember("Array", memberName);
  }
  if (host.isCsharpStringType(receiverType)) {
    return sourceLibraryMember("String", memberName);
  }
  if (isCsharpJsRegExpTargetType(receiverType)) {
    return sourceLibraryMember("RegExp", memberName);
  }
  const libraryTypeName = getSourceLibraryTypeNameForSubject(receiver, context);
  return libraryTypeName === "Array" ||
      libraryTypeName === "ReadonlyArray" ||
      libraryTypeName === "String" ||
      libraryTypeName === "RegExp"
    ? sourceLibraryMember(libraryTypeName, memberName)
    : undefined;
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

export function asNodeSubject(subject: unknown): Node | undefined {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly Kind?: unknown }).Kind === "number"
    ? subject as Node
    : undefined;
}

export function asType(subject: unknown): Type | undefined {
  return typeof subject === "object" && subject !== null && "flags" in subject ? subject as Type : undefined;
}

export function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_value, index) => index);
}

function sourceLibraryMember(declaringName: string, memberName: string): SourceLibraryMember {
  return {
    declaringName,
    memberName,
    fileName: "bundled:///libs/lib.es5.d.ts",
  };
}

function normalizeSourceLibraryDeclaringName(name: string): string {
  return name.endsWith("Constructor") ? name.slice(0, -"Constructor".length) : name;
}

function getSourceLibraryTypeNameForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): "Array" | "ReadonlyArray" | "String" | "RegExp" | undefined {
  const type = asType(subject);
  if (type === undefined) {
    return undefined;
  }
  if (isSourceLibraryType(type, context, "Array")) {
    return "Array";
  }
  if (isSourceLibraryType(type, context, "ReadonlyArray")) {
    return "ReadonlyArray";
  }
  if (isSourceLibraryType(type, context, "String")) {
    return "String";
  }
  return isSourceLibraryType(type, context, "RegExp") ? "RegExp" : undefined;
}

function isCsharpJsRegExpTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === "Tsonic.CSharp.Js.RegExp";
}
