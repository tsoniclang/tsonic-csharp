import type { CsharpJsonObjectShapePolicyInput } from "../model/json-object-shapes.js";
import type { CsharpJsonObjectShapeContractResult } from "../../target-model/records/json-object-shapes.js";
import { csharpJsonObjectProtocol } from "../../target-model/records/json-object-shapes.js";
import { objectShapeStorageMemberName } from "../../target-model/names/object-members.js";
import {
  getCsharpDelegateSignature,
} from "../../target-model/types/carriers/delegates.js";
import {
  isCsharpStringTargetType,
} from "../../target-model/types/identity.js";

export function selectCsharpJsonObjectShapeContract(
  { shape }: CsharpJsonObjectShapePolicyInput,
): CsharpJsonObjectShapeContractResult {
  const candidates = shape.members.filter((member) =>
    member.memberKind === "method" &&
    member.sourceKey.kind === "property" &&
    member.sourceKey.name === csharpJsonObjectProtocol.sourceProperty
  );
  if (candidates.length === 0) {
    return { kind: "resolved", contract: Object.freeze({ kind: "properties", properties: Object.freeze(shape.members
      .filter(member => member.memberKind !== "method" && member.sourceKey.kind === "property")
      .map(member => Object.freeze({ key: member.sourceName, name: objectShapeStorageMemberName(shape, member) }))) }) };
  }
  if (candidates.length !== 1) {
    return {
      kind: "rejected",
      reason: "Closed JSON serialization requires exactly one source-selected toJSON member.",
    };
  }
  const member = candidates[0]!;
  const signature = getCsharpDelegateSignature(member.type);
  if (signature === undefined) {
    return {
      kind: "rejected",
      reason: "Closed JSON serialization requires an exact callable contract for the selected toJSON member.",
    };
  }
  if (
    signature.parameters.length > 1 ||
    (signature.parameters.length === 1 &&
      !isCsharpStringTargetType(signature.parameters[0]))
  ) {
    return {
      kind: "rejected",
      reason: "A selected toJSON member must accept either no parameters or one string property key.",
    };
  }
  return {
    kind: "resolved",
    contract: {
      kind: "to-json",
      member,
      returnType: signature.returnType,
      passesPropertyKey: signature.parameters.length === 1,
    },
  };
}
