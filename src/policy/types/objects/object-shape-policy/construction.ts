import {
  canonicalCsharpObjectShapeImplementedTypes,
  canonicalCsharpObjectShapeMembers,
  csharpObjectShapeMemberContractKey,
  csharpObjectShapeMemberContractParts,
} from "../../../../target-model/types/object-shape-identity.js";
import { canUseCsharpJsValueObjectShapeCarrier } from "../../../../target-model/types/js-value-object-shapes.js";
import { createHash } from "node:crypto";
import { csharpTargetNamedType } from "../../../../target-model/types/factories.js";
import { csharpTsValueTargetType } from "../../../../target-model/types/runtime-carriers.js";
import { isPlainCsharpIdentifier } from "../../../../target-model/names/identifiers.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../../target-model/types/model.js";

export function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
): TargetTypeRef {
  const canonicalMembers = canonicalCsharpObjectShapeMembers(members);
  const canonicalImplemented = canonicalCsharpObjectShapeImplementedTypes(
    implemented ?? [],
  );
  const key = JSON.stringify({
    members: canonicalMembers.map(csharpObjectShapeMemberContractParts),
    implements: canonicalImplemented.map(targetTypeRefKey),
  });
  const identity = createHash("sha256").update(key).digest("hex");
  const name = `__TsonicShape_${identity}`;
  const typeParameters = collectObjectShapeTypeParameters(
    canonicalMembers,
    canonicalImplemented,
  );
  const jsValueCarrier =
    canUseCsharpJsValueObjectShapeCarrier(
      canonicalMembers,
      canonicalImplemented,
    );
  const jsValueType = csharpTsValueTargetType();
  return csharpTargetNamedType(
    `tsonic.shape:${identity}`,
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
      : {},
  );
}

function collectObjectShapeTypeParameters(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
): readonly TargetTypeRef[] {
  const parameters = new Map<string, TargetTypeRef>();
  const collect = (type: TargetTypeRef): void => {
    switch (type.kind) {
      case "type-parameter":
        parameters.set(type.name, type);
        return;
      case "source-global":
      case "target-named":
        for (const argument of type.typeArguments ?? []) {
          collect(argument);
        }
        return;
      case "array":
        collect(type.element);
        return;
      case "tuple":
        type.elements.forEach(collect);
        return;
      case "pointer":
        collect(type.pointee);
        return;
      case "function-pointer":
        type.args.forEach(collect);
        collect(type.result);
        return;
      case "associated-type":
        collect(type.owner);
        return;
      case "source-primitive":
      case "opaque":
      case "lifetime":
      case "target-specific":
        return;
    }
  };
  members.forEach((member) => collect(member.type));
  (implemented ?? []).forEach(collect);
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
