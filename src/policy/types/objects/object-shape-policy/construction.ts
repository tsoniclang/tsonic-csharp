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
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpSourceMemberKey, TargetTypeRef } from "../../../../target-model/types/model.js";
import {
  csharpWellKnownSymbolTargetMemberName,
} from "../../../../target-model/types/source-member-keys.js";

export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
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
  const key = JSON.stringify({
    members: canonicalMembers.map(member => contract
      ? [csharpObjectShapeMemberContractParts(member), member.readonly === true]
      : csharpObjectShapeMemberContractParts(member)),
    implements: canonicalImplemented.map(targetTypeRefKey),
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
  const typeParameters = collectObjectShapeTypeParameters(
    canonicalMembers,
    canonicalImplemented,
    implementation,
  );
  const jsValueCarrier =
    canUseCsharpJsValueObjectShapeCarrier(
      canonicalMembers,
      canonicalImplemented,
    );
  const jsValueType = csharpTsValueTargetType();
  return csharpTargetNamedType(
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
        }
      : contract ? { structuralContract: true } : {},
  );
}

function collectObjectShapeTypeParameters(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
  implementation?: CsharpObjectShapeFact["methodImplementation"],
): readonly TargetTypeRef[] {
  const parameters = new Map<string, TargetTypeRef>();
  const collect = (type: TargetTypeRef, boundNames: ReadonlySet<string> = new Set()): void => {
    switch (type.kind) {
      case "type-parameter":
        if (!boundNames.has(type.name)) parameters.set(type.name, type);
        return;
      case "source-global":
      case "target-named":
        for (const argument of type.typeArguments ?? []) {
          collect(argument, boundNames);
        }
        return;
      case "array":
        collect(type.element, boundNames);
        return;
      case "tuple":
        type.elements.forEach(element => collect(element, boundNames));
        return;
      case "pointer":
        collect(type.pointee, boundNames);
        return;
      case "function-pointer":
        type.args.forEach(argument => collect(argument, boundNames));
        collect(type.result, boundNames);
        return;
      case "associated-type":
        collect(type.owner, boundNames);
        return;
      case "source-primitive":
      case "opaque":
      case "lifetime":
      case "target-specific":
        return;
    }
  };
  members.forEach(member => {
    const boundNames = new Set(member.typeParameters?.map(parameter => parameter.name));
    collect(member.type, boundNames);
    if (member.methodStorageType !== undefined) collect(member.methodStorageType);
    member.typeParameters?.forEach(parameter => parameter.constraints.forEach(constraint => {
      if (constraint.kind === "type") collect(constraint.type, boundNames);
    }));
  });
  (implemented ?? []).forEach(type => collect(type));
  implementation?.captures.forEach(capture => collect(capture.type));
  return [...parameters.values()].sort((left, right) =>
    targetTypeRefKey(left).localeCompare(targetTypeRefKey(right))
  );
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
