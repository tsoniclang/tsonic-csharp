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
  JsSurfaceSelectedSourceIdentity,
} from "../target-member-metadata.js";
import {
  jsSurfaceSelectedSourceIdentityForMember,
} from "../target-member-metadata.js";
import type {
  LifecycleContext,
} from "./types.js";

export function getSelectedSourceIdentityForStructuralUse(
  use: TargetSourceUseRecord,
  lifecycleContext: LifecycleContext,
): JsSurfaceSelectedSourceIdentity | undefined {
  return selectedSourceIdentityFromDeclaration(
    use.selectedDeclaration ?? use.selectedSignatureDeclaration,
    lifecycleContext,
  );
}

function selectedSourceIdentityFromDeclaration(
  declaration: TargetSourceUseRecord["selectedDeclaration"],
  lifecycleContext: LifecycleContext,
): JsSurfaceSelectedSourceIdentity | undefined {
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const sourceMember = resolveSourceLibraryMemberIdentity(declaration, context);
  return sourceMember === undefined
    ? undefined
    : jsSurfaceSelectedSourceIdentityForMember(sourceMember);
}
