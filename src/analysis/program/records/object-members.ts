import type { CsharpObjectMemberEmission, CsharpObjectMemberRecords } from "../../../target-model/records/object-members.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import { objectShapeArtifactKey } from "../../../target-model/records/object-shape-keys.js";
import { csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";

export function createCsharpObjectMemberRecords(
  values: ReadonlyMap<string, ReadonlyMap<string, CsharpObjectMemberEmission>>,
  declarations: ReadonlyMap<string, readonly CsharpObjectMemberEmission[]>,
): CsharpObjectMemberRecords {
  return Object.freeze({
    objectMember: Object.freeze({ get: (shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact) => values.get(objectShapeArtifactKey(shape))?.get(csharpObjectShapeMemberContractKey(member)) }),
    objectMemberDeclarations: Object.freeze({ get: (shape: CsharpObjectShapeFact) => declarations.get(objectShapeArtifactKey(shape)) }),
  });
}
