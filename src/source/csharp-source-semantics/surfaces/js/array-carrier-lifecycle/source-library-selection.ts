import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  getSourceLibraryMember,
} from "../source-library.js";
import type {
  SourceLibraryMember,
} from "../source-library.js";
import type {
  LifecycleContext,
} from "./types.js";

export function getSelectedArraySourceLibraryMemberForPropertyAccess(
  propertyAccess: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const symbol = compiler.checker.getSymbolAtLocation(propertyAccess, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(propertyAccess, { sourceFile });
  return arraySourceLibraryMemberFromDeclaration(firstSymbolDeclaration(symbol), lifecycleContext);
}

export function getSelectedArraySourceLibraryMemberForCall(
  call: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  const signature = lifecycleContext.compiler?.checker.getResolvedSignature(call, { sourceFile });
  return arraySourceLibraryMemberFromDeclaration(getSignatureDeclaration(signature), lifecycleContext);
}

function arraySourceLibraryMemberFromDeclaration(
  declaration: Node | undefined,
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const member = getSourceLibraryMember(declaration, context);
  return member !== undefined && (
    member.declaringName === "Array" ||
    member.declaringName === "ReadonlyArray" ||
    member.declaringName === "Object"
  )
    ? member
    : undefined;
}

function firstSymbolDeclaration(symbol: unknown): Node | undefined {
  return ((symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (symbol as { readonly declarations?: readonly Node[] } | undefined)?.declarations)?.[0];
}

function getSignatureDeclaration(signature: unknown): Node | undefined {
  return asNodeSubject((signature as { readonly declaration?: unknown } | undefined)?.declaration);
}
