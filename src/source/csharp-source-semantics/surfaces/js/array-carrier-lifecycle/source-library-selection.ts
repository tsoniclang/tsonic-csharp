import type {
  TargetSourceUseRecord,
} from "@tsonic/target-api";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  resolveSourceLibraryMemberIdentity,
} from "../source-library.js";
import type {
  SourceLibraryMember,
} from "../source-library.js";
import type {
  LifecycleContext,
} from "./types.js";

export function getSelectedSourceLibraryMemberForStructuralUse(
  use: TargetSourceUseRecord,
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  return sourceLibraryMemberFromDeclaration(use.selectedDeclaration, lifecycleContext);
}

function sourceLibraryMemberFromDeclaration(
  declaration: TargetSourceUseRecord["selectedDeclaration"],
  lifecycleContext: LifecycleContext,
): SourceLibraryMember | undefined {
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  return resolveSourceLibraryMemberIdentity(declaration, context);
}
