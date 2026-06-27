import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import {
  asNodeSubject,
  isDeclarationOrVirtualSourceFile,
} from "../ast-utils.js";
import {
  unwrapNullableTargetType,
} from "../target-rules.js";
import {
  dotnetNativeArrayTypeId,
} from "../../../providers/dotnet/native-array.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;
const nodeFlagsAmbient = 8388608;

export function getSourceReceiverTargetType(
  receiverTypeSubject: ExtensionFactSubject | undefined,
  receiverSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(receiverSubject, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false }) ??
      host.getTargetTypeRefForSubject(receiverTypeSubject, context, { allowRuntimeCarrier: true }) ??
      host.getTargetTypeRefForSubject(receiverSubject, context, { ...noRuntimeCarrierQuery, allowSemanticTypeQuery: false }) ??
      host.getTargetTypeRefForSubject(receiverTypeSubject, context, noRuntimeCarrierQuery),
  );
}

export function targetTypeRefIsSourceDeclaredReceiver(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined;
}

export function selectedDeclarationIsAmbientOrExternal(
  selectedDeclarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  const selectedDeclaration = asNodeSubject(selectedDeclarationSubject);
  const compiler = context.compiler;
  if (selectedDeclaration === undefined || compiler === undefined) {
    return false;
  }
  const sourceFile = compiler.ast.getSourceFile(selectedDeclaration);
  return isDeclarationOrVirtualSourceFile(sourceFile, compiler.ast) ||
    hasAmbientNodeFlag(selectedDeclaration);
}

export function getNativeArrayReceiverType(
  receiverTypeSubject: ExtensionFactSubject | undefined,
  receiverSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return asNativeArrayTargetType(unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(receiverTypeSubject, context, { allowRuntimeCarrier: true }) ??
      host.getTargetTypeRefForSubject(receiverSubject, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false }) ??
      host.getTargetTypeRefForSubject(receiverTypeSubject, context, noRuntimeCarrierQuery) ??
      host.getTargetTypeRefForSubject(receiverSubject, context, { ...noRuntimeCarrierQuery, allowSemanticTypeQuery: false }),
  ));
}

export function asNativeArrayTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind === "array") {
    return type;
  }
  if (type?.kind !== "target-named" || type.id !== dotnetNativeArrayTypeId) {
    return undefined;
  }
  const element = type.typeArguments?.[0];
  return element === undefined
    ? undefined
    : {
        kind: "array",
        element,
      };
}

function hasAmbientNodeFlag(node: Node): boolean {
  const flags = (node as { readonly Flags?: unknown }).Flags;
  return typeof flags === "number" && (flags & nodeFlagsAmbient) !== 0;
}
