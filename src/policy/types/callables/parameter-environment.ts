import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef, CsharpTypeParameterConstraintResolution } from "../../../target-model/types/native-type-data.js";
import { snapshotCsharpTargetTypes } from "../../../target-model/types/snapshot.js";
import { csharpMetadataDescriptors } from "../../../target-model/metadata/immutable.js";

import type { CsharpTypeParameterEnvironment, CsharpTypeParameterSnapshot, CsharpTypeParameterSourceEvidence } from "../../../target-model/records/types/type-parameter-constraints.js";
type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
export function createCsharpTypeParameterEnvironment(
  resolve: (parameter: TypeParameter, source?: CsharpTypeParameterSourceEvidence) =>
    CsharpTypeParameterConstraintResolution | undefined,
): CsharpTypeParameterEnvironment {
  const cache = new Map<string, { readonly input: Readonly<Record<string, PropertyDescriptor>>;
    readonly snapshot: CsharpTypeParameterSnapshot }>();
  const active = new Set<string>();
  return Object.freeze({ resolve(parameter, source, budget) {
    const descriptors = csharpMetadataDescriptors(parameter);
    if (descriptors.kind?.value !== "type-parameter") throw new TypeError("A native generic owner requires exact parameter carriers.");
    const previous = cache.get(parameter.identity);
    const keys = Object.keys(descriptors);
    if (previous !== undefined && (parameter === previous.snapshot ||
      keys.length === Object.keys(previous.input).length &&
      keys.every(key => descriptors[key]!.value === previous.input[key]?.value))) return previous.snapshot;
    const formed = snapshotCsharpTargetTypes([parameter], budget)[0]!;
    if (formed.kind !== "type-parameter") throw new TypeError("A native generic owner requires exact parameter carriers.");
    let resolution: CsharpTypeParameterConstraintResolution | undefined;
    if (active.has(parameter.identity)) resolution = { kind: "unsupported",
      reason: `Generic binder '${parameter.name}' constraint resolution reentered an unfinished native contract.` };
    else {
      active.add(parameter.identity);
      try {
        resolution = resolve(formed, source);
      } finally {
        active.delete(parameter.identity);
      }
    }
    resolution ??= { kind: "unsupported", reason: `Generic binder '${parameter.name}' has no sealed native constraint evidence.` };
    const finalized = formed.csharpConstraints === resolution ? formed
      : snapshotCsharpTargetTypes([{ ...formed, csharpConstraints: resolution }], budget)[0]!;
    if (finalized.kind !== "type-parameter" || finalized.csharpConstraints === undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "A native generic parameter requires finalized constraint evidence.");
    }
    const immutable = finalized as CsharpTypeParameterSnapshot;
    if (resolution.kind === "resolved") cache.set(parameter.identity, { input: descriptors, snapshot: immutable });
    return immutable;
  } } satisfies CsharpTypeParameterEnvironment);
}
