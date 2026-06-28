import type {
  SourceFile,
  Symbol,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetSourceUseRecord,
} from "@tsonic/target-api";
import {
  carrierRequirementsForStructuralCallArgumentUse,
  carrierRequirementsForStructuralPropertyUse,
} from "./array-use-rules.js";
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
  elementType: TargetTypeRef,
  lifecycleContext: LifecycleContext,
): ReadonlySet<CsharpArrayCarrierRequirement> {
  return new Set(sourceUses.flatMap((use) => carrierRequirementsForArrayStructuralUse(use, elementType, lifecycleContext)));
}

function carrierRequirementsForArrayStructuralUse(
  use: TargetSourceUseRecord,
  elementType: TargetTypeRef,
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
    return carrierRequirementsForStructuralPropertyUse(use, elementType, lifecycleContext);
  }
  if (use.operation === "iteration") {
    return use.iterationKind === "for-in" ? ["index-read", "length-read"] : ["sequential-read"];
  }
  if (use.operation === "spread") {
    return ["sequential-read"];
  }
  if (use.operation === "destructure") {
    return ["index-read", "length-read"];
  }
  if (use.operation === "argument") {
    return carrierRequirementsForStructuralCallArgumentUse(use, elementType, lifecycleContext);
  }
  return [];
}
