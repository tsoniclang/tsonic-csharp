import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage, CsharpCaptureStoragePublication, CsharpOriginalCapturedPlace } from "../../../../target-model/records/callables/capture-storage.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";

const empty: readonly Node[] = Object.freeze([]);

export function sealCsharpCaptureStorage(input: CsharpCaptureStoragePublication): CsharpCaptureStorage {
  const places = new Map<Node, CsharpOriginalCapturedPlace>();
  for (const capture of input.lexicalCaptures) for (const place of capture.values) {
    const previous = places.get(place.declaration);
    if (previous !== undefined && (previous.scope !== place.scope || !targetTypeRefEquals(previous.type, place.type) ||
        previous.mutable !== place.mutable || previous.initialization !== place.initialization)) {
      failTargetAnalysisInvariant("tsonic-csharp", "An original captured place requires one completed physical storage decision.", place.declaration);
    }
    places.set(place.declaration, previous === undefined ? place : Object.freeze({ ...previous,
      references: Object.freeze([...new Set([...previous.references, ...place.references])]) }));
  }
  const declarations = new Map([...input.lexicalDeclarations].map(declaration => [declaration, Object.freeze([declaration])]));
  return Object.freeze({
    issues: Object.freeze([...input.issues]),
    frames: input.frames,
    lexicalCaptures: input.lexicalCaptures,
    capturedPlace: Object.freeze({ get: (declaration: Node) => places.get(declaration) }),
    captureFrame: Object.freeze({ get: (scope: Node) => input.byScope.get(scope) }),
    capturedBinding: Object.freeze({ get: (declaration: Node) => input.byBinding.get(declaration) }),
    physicalStorageType: Object.freeze({ get(declaration: Node, logicalType: TargetTypeRef): TargetTypeRef {
      const selected = input.physicalTypes.get(declaration);
      if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A physical capture read requires its completed analysis decision.", declaration);
      return selected === null ? logicalType : selected;
    } }),
    captureClosure: Object.freeze({ get: (declaration: Node) => input.byClosure.get(declaration) }),
    captureFrameShape: Object.freeze({ get: (type: TargetTypeRef) => input.byShape.get(targetTypeRefKey(type)) }),
    namedSelf: Object.freeze({ get: (declaration: Node) => input.namedSelfBindings.get(declaration) }),
    helperAccess: Object.freeze({ get: (declaration: Node) => input.helperMembers.has(declaration) }),
    lexicalValueDeclarations: Object.freeze({ get: (declaration: Node) => declarations.get(declaration) ?? empty }),
  });
}
