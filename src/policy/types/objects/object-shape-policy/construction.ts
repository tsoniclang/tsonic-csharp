import {
  canonicalCsharpObjectShapeImplementedTypes,
  canonicalCsharpObjectShapeMembers,
  csharpObjectShapeMemberContractKey,
  csharpObjectShapeMemberContractParts,
  csharpStructuralObjectShapeIdPrefix,
} from "../../../../target-model/types/object-shape-identity.js";
import { canUseCsharpJsValueObjectShapeCarrier } from "../../../../target-model/types/js-value-object-shapes.js";
import { createHash } from "node:crypto";
import { csharpTargetNamedType } from "../../../../target-model/types/factories.js";
import { csharpEmptyObjectTargetType, csharpTsValueTargetType } from "../../../../target-model/types/runtime-carriers.js";
import { isPlainCsharpIdentifier } from "../../../../target-model/names/identifiers.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { csharpObjectShapeTypeParameters, closeCsharpOwnerTypeParameterEnvironment,
  type CsharpTypeParameterConstraintResolver } from "../../../../target-model/types/generic-references.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpSourceMemberKey, TargetTypeRef } from "../../../../target-model/types/model.js";
import {
  csharpWellKnownSymbolTargetMemberName,
} from "../../../../target-model/types/source-member-keys.js";
import { csharpTypeParameterConstraintResolutionKey } from "../../../../target-model/declarations/generic-constraints.js";

export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  environment: CsharpTypeParameterConstraintResolver,
  contract = false,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): TargetTypeRef {
  if (members.length === 0 && (implemented?.length ?? 0) === 0) {
    return csharpEmptyObjectTargetType();
  }
  const canonicalMembers = canonicalCsharpObjectShapeMembers(members);
  const canonicalImplemented = canonicalCsharpObjectShapeImplementedTypes(
    (implemented ?? []).filter(type => !members.some(member => member.methodValueContract !== undefined &&
      targetTypeRefKey(member.methodValueContract) === targetTypeRefKey(type))),
  );
  const typeParameters = closeCsharpOwnerTypeParameterEnvironment(csharpObjectShapeTypeParameters(
    canonicalMembers, canonicalImplemented, implementation,
  ), environment);
  const key = JSON.stringify({
    members: canonicalMembers.map(member => contract
      ? [csharpObjectShapeMemberContractParts(member), member.readonly === true]
      : csharpObjectShapeMemberContractParts(member)),
    implements: canonicalImplemented.map(targetTypeRefKey),
    ...(typeParameters.length === 0 ? {} : { parameters: typeParameters.map(parameter => [parameter.identity,
      csharpTypeParameterConstraintResolutionKey(parameter.csharpConstraints)]) }),
    ...(!contract && canonicalMembers.some(member => member.methodStorageType !== undefined) ? {
      methodStorage: canonicalMembers.map(member => member.methodStorageType === undefined ? null : targetTypeRefKey(member.methodStorageType)),
    } : {}),
    ...(contract ? { contract: true } : {}),
    ...(implementation === undefined ? {} : { implementation: implementation.identity,
      captures: implementation.captures.map(capture => [capture.fieldName, targetTypeRefKey(capture.type), capture.mutable]),
    }),
  });
  const identity = createHash("sha256").update(key).digest("hex");
  const name = `__TsonicShape_${identity}`;
  const jsValueCarrier =
    canUseCsharpJsValueObjectShapeCarrier(
      canonicalMembers,
      canonicalImplemented,
    );
  const jsValueType = csharpTsValueTargetType();
  return Object.freeze(csharpTargetNamedType(
    `${csharpStructuralObjectShapeIdPrefix}${identity}`,
    typeParameters.length === 0 ? undefined : typeParameters,
    jsValueCarrier && jsValueType.kind === "target-named"
      ? jsValueType.csharpRender
      : { kind: "named", name },
    jsValueCarrier
      ? {
          valueType: true,
          absorbsNullish: true,
          jsValueCarrier: true,
          jsObjectShape: true,
          typeofRuntimeKind: "object",
        }
      : { typeofRuntimeKind: "object", ...(contract ? { structuralContract: true } : {}) },
  ));
}


export function objectShapeMemberTargetName(sourceName: string): string {
  return isPlainCsharpIdentifier(sourceName)
    ? sourceName
    : `__tsonic_member_${
      createHash("sha256").update(sourceName).digest("hex")
    }`;
}

export function objectShapeMemberTargetNameForKey(
  sourceKey: CsharpSourceMemberKey,
): string | undefined {
  return sourceKey.kind === "property"
    ? objectShapeMemberTargetName(sourceKey.name)
    : csharpWellKnownSymbolTargetMemberName(sourceKey.symbol);
}

export function mergeCsharpObjectShapeSubjects(
  left: CsharpObjectShapeFact,
  right: CsharpObjectShapeFact,
): CsharpObjectShapeFact {
  const rightMembers = new Map(
    right.members.map((member) => [
      csharpObjectShapeMemberContractKey(member),
      member,
    ]),
  );
  return {
    ...left,
    ...(left.declarationTemplate === undefined || right.declarationTemplate === undefined
      ? {}
      : { declarationTemplate: mergeCsharpObjectShapeSubjects(left.declarationTemplate, right.declarationTemplate) }),
    members: left.members.map((member) => {
      const other = rightMembers.get(
        csharpObjectShapeMemberContractKey(member),
      )!;
      const subjects = new Set([
        ...(member.sourceSubjects ?? []),
        ...(other.sourceSubjects ?? []),
      ]);
      const sourceTypes = new Set([
        ...(member.sourceTypes ?? []),
        ...(other.sourceTypes ?? []),
      ]);
      const sourceDeclarations = new Set([
        ...(member.sourceDeclarations ?? []),
        ...(other.sourceDeclarations ?? []),
      ]);
      return {
        ...member,
        ...(subjects.size === 0
          ? {}
          : { sourceSubjects: Object.freeze([...subjects]) }),
        ...(sourceTypes.size === 0
          ? {}
          : { sourceTypes: Object.freeze([...sourceTypes]) }),
        ...(sourceDeclarations.size === 0
          ? {}
          : { sourceDeclarations: Object.freeze([...sourceDeclarations]) }),
      };
    }),
  };
}
