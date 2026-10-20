import type { ArgumentPassingMode } from "@tsonic/tsts";
import type { CsharpTargetBindingFact, CsharpTargetNamedTypeRef, TargetBindingFact, TargetTypeRef } from "./model.js";

export type CsharpNativeInheritanceLookup =
  | { readonly kind: "target-id"; readonly targetId: string }
  | { readonly kind: "metadata-name"; readonly metadataName: string };

export function csharpNativeInheritanceLookup(
  type: CsharpTargetNamedTypeRef,
): CsharpNativeInheritanceLookup {
  const physical = Object.freeze({ kind: "target-id" as const, targetId: type.id });
  const shape = type.csharpRender;
  if (shape?.kind !== "named" || shape.externAlias !== undefined ||
    shape.namespace === undefined || shape.usingNamespace !== undefined) return physical;
  const segments = [{ name: shape.name, genericArity: shape.genericArity }, ...(shape.nested ?? [])];
  const names = segments.map((segment, index) => {
    const arity = segment.genericArity ?? (shape.nested === undefined && index === segments.length - 1
      ? type.typeArguments?.length ?? 0 : 0);
    return arity === 0 ? segment.name : `${segment.name}\u0060${arity}`;
  });
  const metadataName = [...shape.namespace, ...names].join(".");
  return type.id === metadataName
    ? Object.freeze({ kind: "metadata-name", metadataName })
    : physical;
}

export interface CsharpNativeInheritedDispatchSlot {
  readonly kind: "method" | "get" | "set" | "add" | "remove";
  readonly id: string;
  readonly baseDefinitionId: string;
  readonly virtual: boolean;
  readonly abstract: boolean;
  readonly final: boolean;
  readonly accessibility: "public" | "protected" | "protected-internal";
  readonly genericParameterIds: readonly string[];
  readonly parameters: readonly {
    readonly type: TargetTypeRef;
    readonly passingMode: ArgumentPassingMode;
  }[];
  readonly returnType: TargetTypeRef;
  readonly returnPassing: "by-value" | "byref-readwrite" | "byref-readonly";
}

export interface CsharpNativeInheritedMember {
  readonly targetName: string;
  readonly kind: "method" | "property" | "field" | "event" | "type";
  readonly static: boolean;
  readonly accessibility: "public" | "protected" | "protected-internal";
  readonly genericArity: number;
  readonly genericParameterIds: readonly string[];
  readonly dispatchSlots: readonly CsharpNativeInheritedDispatchSlot[];
  readonly parameters: readonly {
    readonly type: TargetTypeRef;
    readonly passingMode: ArgumentPassingMode;
  }[];
}

export interface CsharpNativeInheritanceEntry {
  readonly targetId: string;
  readonly type: TargetTypeRef;
}

export interface CsharpNativeTargetBindingFact extends CsharpTargetBindingFact {
  readonly csharpInheritance: readonly CsharpNativeInheritanceEntry[];
  readonly csharpInheritableMembers: readonly CsharpNativeInheritedMember[];
}

export function csharpNativeTargetBindingFact(
  binding: TargetBindingFact | undefined,
): CsharpNativeTargetBindingFact | undefined {
  return binding !== undefined &&
    "csharpInheritance" in binding &&
    Array.isArray(binding.csharpInheritance) &&
    "csharpInheritableMembers" in binding &&
    Array.isArray(binding.csharpInheritableMembers) &&
    binding.csharpInheritableMembers.every(member => member !== null &&
      typeof member === "object" && "dispatchSlots" in member &&
      Array.isArray(member.dispatchSlots))
    ? binding as CsharpNativeTargetBindingFact
    : undefined;
}
