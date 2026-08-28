import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  TargetTypeRef,
} from "./model.js";
import {
  getCsharpDelegateSignature,
} from "./delegates.js";
import {
  isCsharpStringTargetType,
} from "./identity.js";

export type CsharpJsonObjectShapeContract =
  | { readonly kind: "properties" }
  | {
      readonly kind: "to-json";
      readonly member: CsharpObjectShapeMemberFact;
      readonly returnType: TargetTypeRef;
      readonly passesPropertyKey: boolean;
    };

export type CsharpJsonObjectShapeContractResult =
  | {
      readonly kind: "resolved";
      readonly contract: CsharpJsonObjectShapeContract;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export function resolveCsharpJsonObjectShapeContract(
  shape: CsharpObjectShapeFact,
): CsharpJsonObjectShapeContractResult {
  const candidates = shape.members.filter((member) =>
    member.memberKind === "method" &&
    member.sourceKey.kind === "property" &&
    member.sourceKey.name === "toJSON"
  );
  if (candidates.length === 0) {
    return { kind: "resolved", contract: { kind: "properties" } };
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
