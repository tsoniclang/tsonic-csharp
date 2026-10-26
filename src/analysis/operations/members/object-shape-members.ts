import type { AstReader, ExtensionFactSubject, Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpObjectShapeMemberRetainsNativeReference } from "../../../policy/types/objects/member-reads.js";
export function selectCsharpObjectShapeProperty(
  shape: CsharpObjectShapeFact | undefined,
  receiver: Type,
  access: Node,
  selectedSubjects: readonly ExtensionFactSubject[],
  selectedType: Type | undefined,
  semantics: SourceFileSemantics,
  ast: AstReader,
): { readonly subjects: readonly ExtensionFactSubject[]; readonly type: Type | undefined } {
  if (!semantics.types.isAny(receiver) && !semantics.types.isUnknown(receiver)) return { subjects: selectedSubjects, type: selectedType };
  const name = ast.is.IsPropertyAccessExpression(access) ? ast.as.AsPropertyAccessExpression(access)?.name : undefined;
  if (shape?.sourceType === undefined || name === undefined || !ast.is.IsIdentifier(name)) return { subjects: selectedSubjects, type: selectedType };
  const sourceName = ast.text(name);
  const members = semantics.types.propertyInfos(shape.sourceType).filter(member => member.name === sourceName);
  return members.length === 1 ? { subjects: semantics.facts.selectedSubjects(members[0]!.symbol, undefined), type: members[0]!.type }
    : { subjects: [], type: undefined };
}

export function resolveCsharpObjectShapeMemberReadTargetType(
  member: CsharpObjectShapeMemberFact,
  selectedSourceType: Type | undefined,
  sourceTypesAgree: (left: Type, right: Type) => boolean =
    (left, right) => left === right,
  selectedTargetType?: TargetTypeRef,
): TargetTypeRef | undefined {
  return selectedSourceType !== undefined &&
      member.sourceTypes?.some((sourceType) =>
        sourceTypesAgree(sourceType, selectedSourceType)
      ) === true
    ? csharpObjectShapeMemberRetainsNativeReference(selectedTargetType, member.type)
      ? selectedTargetType : member.type
    : undefined;
}
