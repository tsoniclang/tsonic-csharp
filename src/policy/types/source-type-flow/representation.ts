import type { Node } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType } from "../../../target-model/types/carriers/js.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import { createStructuralObjectShapeTarget } from "../../../analysis/objects/shapes/construction.js";
import { objectShapeMemberTargetName } from "../../identities/source-member-names.js";
import { selectedCsharpSourceProfileOwner } from "../../identities/source-types.js";

export interface CsharpSourceTypeRepresentationHost {
  readonly target: TargetSelection;
  readonly typeParameterConstraints: CsharpTypeParameterEnvironment;
  declaredType(
    declaration: Node,
    typeArguments: readonly TargetTypeRef[],
    source: Extract<SourceTypeDescriptor, { readonly kind: "declared" }>["source"],
  ): TargetTypeRef | undefined;
  retainShape(shape: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined;
}

export function representCsharpSourceType(
  host: CsharpSourceTypeRepresentationHost,
  descriptor: SourceTypeDescriptor,
): TargetTypeRef | undefined {
  return representDescriptor(host, descriptor, new Set());
}

function representDescriptor(
  host: CsharpSourceTypeRepresentationHost,
  descriptor: SourceTypeDescriptor,
  active: Set<SourceTypeDescriptor>,
): TargetTypeRef | undefined {
  if (active.has(descriptor)) return undefined;
  active.add(descriptor);
  try {
    switch (descriptor.kind) {
      case "primitive":
        return csharpSourcePrimitiveTargetType(descriptor.primitive);
      case "string":
        return csharpStringTargetType();
      case "array": {
        const element = representDescriptor(host, descriptor.element, active);
        return element === undefined ? undefined
          : selectedCsharpSourceProfileOwner(host.target) === "js"
            ? csharpJsArrayTargetType(element)
            : Object.freeze({ kind: "array", element });
      }
      case "tuple": {
        const first = representDescriptor(host, descriptor.elements[0], active);
        const second = representDescriptor(host, descriptor.elements[1], active);
        return first === undefined || second === undefined ? undefined
          : Object.freeze({ kind: "tuple", elements: Object.freeze([first, second]) });
      }
      case "optional": {
        const element = representDescriptor(host, descriptor.value, active);
        return element === undefined ? undefined : csharpNullableTargetType(element);
      }
      case "declared": {
        const arguments_: TargetTypeRef[] = [];
        for (const argument of descriptor.typeArguments) {
          const represented = representDescriptor(host, argument, active);
          if (represented === undefined) return undefined;
          arguments_.push(represented);
        }
        return host.declaredType(descriptor.declaration, Object.freeze(arguments_), descriptor.source);
      }
      case "shape": {
        const members: CsharpObjectShapeMemberFact[] = [];
        const names = new Set<string>();
        for (const member of descriptor.members) {
          if (names.has(member.name)) return undefined;
          names.add(member.name);
          const type = representDescriptor(host, member.type, active);
          if (type === undefined) return undefined;
          members.push(Object.freeze({
            sourceKey: Object.freeze({ kind: "property", name: member.name }),
            sourceName: member.name,
            targetName: objectShapeMemberTargetName(member.name),
            memberKind: "property",
            type,
            ...(member.declaration === undefined ? {} : { sourceDeclarations: Object.freeze([member.declaration]) }),
            ...(member.readonly === undefined ? {} : { readonly: member.readonly }),
          }));
        }
        const targetType = createStructuralObjectShapeTarget(members, undefined, host.typeParameterConstraints);
        const shape = host.retainShape(Object.freeze({ targetType, members: Object.freeze(members) }));
        if (shape === undefined || shape.members.length !== members.length) return undefined;
        if (members.length === 0) return targetTypeRefEquals(shape.targetType, targetType) ? shape.targetType : undefined;
        if (shape.targetType.kind !== "target-named") return undefined;
        const carrier: CsharpTargetNamedTypeRef = shape.targetType;
        if (carrier.csharpGeneratedStructuralStorage !== true || carrier.csharpStructuralContract === true) return undefined;
        const retained = canonicalCsharpObjectShapeMembers(shape.members);
        const expected = canonicalCsharpObjectShapeMembers(members);
        return expected.every((member, index) => {
          const actual = retained[index]!;
          return csharpObjectShapeMemberContractKey(actual) === csharpObjectShapeMemberContractKey(member) &&
            (actual.readonly === true) === (member.readonly === true) &&
            (member.sourceDeclarations ?? []).every(declaration => actual.sourceDeclarations?.includes(declaration) === true);
        }) ? shape.targetType : undefined;
      }
    }
  } finally {
    active.delete(descriptor);
  }
}
