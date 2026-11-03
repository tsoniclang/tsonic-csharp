import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeContract, CsharpObjectShapeMemberContract, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpObjectShapeMemberContractKey } from "./object-shape-identity.js";
import type { CsharpTypeParameterEnvironment } from "../records/types/type-parameter-constraints.js";

export interface CsharpObjectShapeHeader {
  readonly contract: CsharpObjectShapeContract;
  readonly memberKeys: readonly string[];
  readonly declarationTemplate: CsharpObjectShapeHeader | undefined;
}

export function completeCsharpObjectShapeOwnerHeader(
  type: CsharpTargetNamedTypeRef,
  projectOwner: boolean,
  environment: CsharpTypeParameterEnvironment,
): CsharpTargetNamedTypeRef | undefined {
  if (!projectOwner || type.typeArguments === undefined) return type;
  const arguments_ = type.typeArguments.map(argument => {
    if (argument.kind !== "type-parameter") return argument;
    const selected = environment.resolve(argument);
    return selected.csharpConstraints.kind === "resolved" ? selected : undefined;
  });
  return arguments_.some(argument => argument === undefined) ? undefined
    : { ...type, typeArguments: Object.freeze(arguments_ as readonly TargetTypeRef[]) };
}

function memberContract(input: CsharpObjectShapeMemberContract): CsharpObjectShapeMemberContract {
  return Object.freeze({
    sourceKey: input.sourceKey,
    sourceName: input.sourceName,
    targetName: input.targetName,
    memberKind: input.memberKind,
    type: input.type,
    ...(input.exactNumericStorage === undefined ? {} : { exactNumericStorage: input.exactNumericStorage }),
    ...(input.methodValueContract === undefined ? {} : { methodValueContract: input.methodValueContract }),
    ...(input.methodValueStorage === undefined ? {} : { methodValueStorage: input.methodValueStorage }),
    ...(input.typeParameters === undefined ? {} : { typeParameters: input.typeParameters }),
    ...(input.optional === undefined ? {} : { optional: input.optional }),
    ...(input.readonly === undefined ? {} : { readonly: input.readonly }),
    ...(input.accessor === undefined ? {} : { accessor: input.accessor }),
    ...(input.bound === undefined ? {} : { bound: input.bound }),
  });
}

export function formCsharpObjectShapeHeader(input: CsharpObjectShapeContract): CsharpObjectShapeHeader {
  const declarationTemplate = input.declarationTemplate === undefined ? undefined
    : formCsharpObjectShapeHeader(input.declarationTemplate);
  const members = Object.freeze(input.members.map(memberContract));
  const contract: CsharpObjectShapeContract = Object.freeze({ targetType: input.targetType, members,
    ...(declarationTemplate === undefined ? {} : { declarationTemplate: declarationTemplate.contract }),
    ...(input.covariantTypeParameterIdentities === undefined ? {} : {
      covariantTypeParameterIdentities: input.covariantTypeParameterIdentities,
    }),
    ...(input.implements === undefined ? {} : { implements: input.implements }),
    ...(input.constructible === undefined ? {} : { constructible: input.constructible }),
    ...(input.methodImplementation === undefined ? {} : { methodImplementation: input.methodImplementation }),
  });
  return Object.freeze({ contract, declarationTemplate,
    memberKeys: Object.freeze(members.map(csharpObjectShapeMemberContractKey)),
  });
}

export function requireCsharpObjectShapeHeader(
  header: CsharpObjectShapeHeader,
  contract: CsharpObjectShapeContract,
): void {
  const retained = header.contract;
  if (retained.targetType !== contract.targetType || retained.members.length !== contract.members.length ||
    retained.covariantTypeParameterIdentities !== contract.covariantTypeParameterIdentities ||
    retained.implements !== contract.implements || retained.constructible !== contract.constructible ||
    retained.methodImplementation !== contract.methodImplementation ||
    retained.members.some((member, index) => {
      const actual = contract.members[index]!;
      return member.sourceKey !== actual.sourceKey || member.sourceName !== actual.sourceName ||
        member.targetName !== actual.targetName || member.memberKind !== actual.memberKind || member.type !== actual.type ||
        member.exactNumericStorage !== actual.exactNumericStorage || member.methodValueContract !== actual.methodValueContract ||
        member.methodValueStorage !== actual.methodValueStorage || member.typeParameters !== actual.typeParameters ||
        member.optional !== actual.optional || member.readonly !== actual.readonly || member.accessor !== actual.accessor ||
        member.bound !== actual.bound;
    })) return failTargetAnalysisInvariant("tsonic-csharp", "Shape completion requires its exact proof-free native header.");
}
