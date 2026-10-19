import type { ArgumentPassingMode } from "@tsonic/tsts";
import type {
  CsharpTargetBindingFact,
  TargetBindingFact,
  TargetTypeRef,
} from "./model.js";

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
