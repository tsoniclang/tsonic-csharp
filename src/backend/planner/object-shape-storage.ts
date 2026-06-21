import type {
  CsharpObjectShapeFact,
} from "../../source/csharp-facts.js";

export function objectShapeStorageMemberName(objectShape: CsharpObjectShapeFact, member: CsharpObjectShapeFact["members"][number]): string {
  if (member.memberKind !== "method") {
    return member.targetName;
  }
  if (!objectShape.members.some((candidate) => candidate === member || candidate.sourceName === member.sourceName && candidate.targetName === member.targetName && candidate.memberKind === member.memberKind)) {
    throw new Error("Object-shape storage member must belong to its object-shape fact.");
  }
  const memberIndex = objectShape.members.findIndex((candidate) => candidate === member ||
    candidate.sourceName === member.sourceName &&
      candidate.targetName === member.targetName &&
      candidate.memberKind === member.memberKind);
  const baseName = `__tsonic_shape_method_${memberIndex}_${member.targetName}`;
  const reservedNames = new Set(objectShape.members.map((candidate) => candidate.targetName));
  let candidate = baseName;
  while (reservedNames.has(candidate)) {
    candidate = `_${candidate}`;
  }
  return candidate;
}
