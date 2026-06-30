import type {
  SourceFile,
  Symbol,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetSourceUseRecord,
} from "@tsonic/target-api";
import type {
  CsharpOperationsProviderHost,
} from "../../../operations-provider.js";
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
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): ReadonlySet<CsharpArrayCarrierRequirement> {
  return new Set(sourceUses.flatMap((use) => carrierRequirementsForArrayStructuralUse(use, elementType, lifecycleContext, host)));
}

function carrierRequirementsForArrayStructuralUse(
  use: TargetSourceUseRecord,
  elementType: TargetTypeRef,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
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
  if (use.operation === "return") {
    return ["dense-mutation"];
  }
  if (use.operation === "argument") {
    return carrierRequirementsForStructuralCallArgumentUse(use, elementType, lifecycleContext, host);
  }
  return [];
}
