import type {
  SourceFile,
  Symbol,
} from "@tsonic/tsts";
import type {
  TargetSourceUseRecord,
} from "@tsonic/target-api";
import {
  getSourceLibraryArrayPropertyCarrierRequirements,
  getSourceLibraryStaticCallArgumentCarrierRequirements,
} from "./array-use-rules.js";
import {
  getSelectedArraySourceLibraryMemberForCall,
  getSelectedArraySourceLibraryMemberForPropertyAccess,
} from "./source-library-selection.js";
import type {
  CsharpArrayCarrierRequirement,
  LifecycleContext,
} from "./types.js";

export function collectArrayStructuralUsesForSymbol(
  sourceFile: SourceFile,
  symbol: Symbol | undefined,
  lifecycleContext: LifecycleContext,
): readonly TargetSourceUseRecord[] {
  return lifecycleContext.analysis?.usesOf(symbol)
    .filter((use) => use.sourceFile === sourceFile) ?? [];
}

export function carrierRequirementsForArrayStructuralUses(
  sourceUses: readonly TargetSourceUseRecord[],
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): ReadonlySet<CsharpArrayCarrierRequirement> {
  return new Set(sourceUses.flatMap((use) => carrierRequirementsForArrayStructuralUse(use, sourceFile, lifecycleContext)));
}

function carrierRequirementsForArrayStructuralUse(
  use: TargetSourceUseRecord,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
): readonly CsharpArrayCarrierRequirement[] {
  if (use.operation === "element") {
    if (use.access === "delete") {
      return ["full-js"];
    }
    return use.access === "write" ? ["dense-mutation"] : ["index-read"];
  }
  if (use.operation === "operator" && use.operator === "in") {
    return ["full-js"];
  }
  if (use.operation === "property" || use.operation === "call") {
    const sourceMember = use.expression === undefined
      ? undefined
      : getSelectedArraySourceLibraryMemberForPropertyAccess(use.expression, sourceFile, lifecycleContext);
    return sourceMember === undefined
      ? []
      : getSourceLibraryArrayPropertyCarrierRequirements(sourceMember, use.access === "write");
  }
  if (use.operation === "iteration") {
    return use.iterationKind === "for-in" ? ["index-read", "length-read"] : ["sequential-read"];
  }
  if (use.operation === "spread") {
    return ["sequential-read"];
  }
  if (use.operation === "argument" && use.call !== undefined && use.argumentIndex !== undefined) {
    const sourceMember = getSelectedArraySourceLibraryMemberForCall(use.call, sourceFile, lifecycleContext);
    return sourceMember === undefined
      ? []
      : getSourceLibraryStaticCallArgumentCarrierRequirements(sourceMember, use.argumentIndex);
  }
  return [];
}
