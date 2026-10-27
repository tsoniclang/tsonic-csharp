import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage, CsharpCaptureStoragePublication } from "../../../../target-model/records/callables/capture-storage.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";

const empty: readonly Node[] = Object.freeze([]);

export function sealCsharpCaptureStorage(input: CsharpCaptureStoragePublication): CsharpCaptureStorage {
  return Object.freeze({
    issues: Object.freeze([...input.issues]),
    frames: input.frames,
    lexicalCaptures: input.lexicalCaptures,
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
    lambdaCreation: Object.freeze({ get: (declaration: Node) => input.lambdaCreations.get(declaration)
      ?? failTargetAnalysisInvariant("tsonic-csharp", "Lambda creation requires its exact admitted native allocation decision.", declaration) }),
    helperAccess: Object.freeze({ get: (declaration: Node) => input.helperMembers.has(declaration) }),
    lexicalValueDeclarations: Object.freeze({ get: (statement: Node) => input.scheduledValues.get(statement) ?? empty }),
    lexicalValueCreation: Object.freeze({ get: (declaration: Node) => input.valueCreations.get(declaration) }),
    lexicalValueName: Object.freeze({ get: (declaration: Node) => input.valueNames.get(declaration) }),
  });
}
