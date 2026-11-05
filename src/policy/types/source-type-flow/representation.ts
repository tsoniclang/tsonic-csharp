import type { Node } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { SourceTypeDescriptor, SourceTypeDescriptorSignature } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpObjectTargetType, csharpVoidTargetType, csharpNeverTargetType, csharpBigIntegerTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType, csharpJsSymbolTargetType } from "../../../target-model/types/carriers/js.js";
import { csharpAnyTargetType, csharpTsValueTargetType, csharpAbsenceTargetType, combineCsharpTargetUnionMembers } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import { createStructuralObjectShapeTarget } from "../../../analysis/objects/shapes/construction.js";
import { objectShapeMemberTargetName } from "../../identities/source-member-names.js";
import { selectedCsharpSourceProfileOwner } from "../../identities/source-types.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";

export interface CsharpSourceTypeRepresentationHost {
  readonly target: TargetSelection;
  readonly typeParameterConstraints: CsharpTypeParameterEnvironment;
  declaredType(
    declaration: Node,
    typeArguments: readonly TargetTypeRef[],
    descriptor: Extract<SourceTypeDescriptor, { readonly kind: "declared" }>,
  ): TargetTypeRef | undefined;
  indexType(key: TargetTypeRef, value: TargetTypeRef): TargetTypeRef | undefined;
  callableType(
    signature: Extract<SourceTypeDescriptor, { readonly kind: "callable" }>["calls"][number],
    parameters: readonly TargetTypeRef[],
    result: TargetTypeRef,
  ): TargetTypeRef | undefined;
  constructorType(
    signatures: Extract<SourceTypeDescriptor, { readonly kind: "callable" }>["constructs"],
    results: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined;
  memberKind(declaration: Node): "property" | "method";
  // True when every member of a construct-carrying shape is part of the static side of the one class its construct
  // signatures belong to: a static member of that class, or its class prototype (K-2448 #3).
  classStaticSide(descriptor: Extract<SourceTypeDescriptor, { readonly kind: "shape" }>): boolean;
  shapeKind(descriptor: Extract<SourceTypeDescriptor, { readonly kind: "shape" }>): "contract" | "storage" | undefined;
  memberTypeParameters(signature: Extract<SourceTypeDescriptor, { readonly kind: "callable" }>["calls"][number]):
    NonNullable<CsharpObjectShapeMemberFact["typeParameters"]> | undefined;
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
  const representConstructor = (constructs: readonly SourceTypeDescriptorSignature[]): TargetTypeRef | undefined => {
    const results: TargetTypeRef[] = [];
    for (const signature of constructs) {
      const result = representDescriptor(host, signature.result, active);
      if (result === undefined) return undefined;
      results.push(result);
    }
    return host.constructorType(constructs, Object.freeze(results));
  };
  try {
    switch (descriptor.kind) {
      case "primitive":
        return csharpSourcePrimitiveTargetType(descriptor.primitive);
      case "string":
        return csharpStringTargetType();
      case "intrinsic":
        switch (descriptor.intrinsic) {
          case "any": return csharpAnyTargetType();
          case "unknown": return csharpTsValueTargetType();
          case "object": return csharpObjectTargetType();
          case "void": return csharpVoidTargetType();
          case "never": return csharpNeverTargetType();
          case "absence": return csharpAbsenceTargetType();
          case "bigint": return csharpBigIntegerTargetType();
          case "symbol": return csharpJsSymbolTargetType();
        }
      case "union": {
        const members: TargetTypeRef[] = [];
        for (const member of descriptor.types) {
          const selected = representDescriptor(host, member, active);
          if (selected === undefined) return undefined;
          members.push(selected);
        }
        return members.length === 0 ? undefined : combineCsharpTargetUnionMembers(members);
      }
      case "callable": {
        if (descriptor.calls.length === 0 && descriptor.constructs.length !== 0) return representConstructor(descriptor.constructs);
        const signature = descriptor.calls.length === 1 && descriptor.constructs.length === 0 ? descriptor.calls[0] : undefined;
        if (signature === undefined) return undefined;
        const parameters: TargetTypeRef[] = [];
        for (const parameter of signature.parameters) {
          const selected = representDescriptor(host, parameter.type, active);
          if (selected === undefined) return undefined;
          parameters.push(selected);
        }
        const result = representDescriptor(host, signature.result, active);
        return result === undefined ? undefined : host.callableType(signature, Object.freeze(parameters), result);
      }
      case "array": {
        const element = representDescriptor(host, descriptor.element, active);
        return element === undefined ? undefined
          : selectedCsharpSourceProfileOwner(host.target) === "js"
            ? csharpJsArrayTargetType(element)
            : Object.freeze({ kind: "array", element });
      }
      case "tuple": {
        if (descriptor.elements.some(element => element.kind !== "required")) return undefined;
        const elements: TargetTypeRef[] = [];
        for (const element of descriptor.elements) {
          const represented = representDescriptor(host, element.type, active);
          if (represented === undefined) return undefined;
          elements.push(represented);
        }
        return Object.freeze({ kind: "tuple", elements: Object.freeze(elements) });
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
        return host.declaredType(descriptor.declaration, Object.freeze(arguments_), descriptor);
      }
      case "shape": {
        if (!Array.isArray(descriptor.indexes)) return undefined;
        // A shape with construct signatures and no call signatures is a constructor value. It is represented as the
        // constructed class's static receiver only when its whole inventory IS that class's static side: no indexes, and
        // every member a static member of that class or its prototype. Any other construct-plus-member/index contract has
        // no native representation here, so its consumer refuses rather than dropping members (K-2448 #3).
        if (descriptor.calls.length === 0 && descriptor.constructs.length !== 0) {
          return descriptor.indexes.length === 0 && (descriptor.members.length === 0 || host.classStaticSide(descriptor))
            ? representConstructor(descriptor.constructs) : undefined;
        }
        if (descriptor.calls.length !== 0) return undefined;
        if (descriptor.indexes.length !== 0) {
          let key: TargetTypeRef | undefined;
          let value: TargetTypeRef | undefined;
          for (const index of descriptor.indexes) {
            if (index.declaration === undefined || typeof index.readonly !== "boolean") return undefined;
            const selectedKey = representDescriptor(host, index.key, active);
            const selectedValue = representDescriptor(host, index.value, active);
            if (selectedKey === undefined || selectedValue === undefined || key !== undefined && !targetTypeRefEquals(key, selectedKey) ||
              value !== undefined && !targetTypeRefEquals(value, selectedValue)) return undefined;
            key = selectedKey;
            value = selectedValue;
          }
          return descriptor.members.length !== 0 || key === undefined || value === undefined ? undefined : host.indexType(key, value);
        }
        const members: CsharpObjectShapeMemberFact[] = [];
        const names = new Set<string>();
        for (const member of descriptor.members) {
          if (typeof member.optional !== "boolean" || names.has(member.name)) return undefined;
          names.add(member.name);
          const type = representDescriptor(host, member.type, active);
          if (type === undefined) return undefined;
          const callable = member.type.kind === "callable" ? member.type : undefined;
          const declaration = member.origin.kind === "declared" ? member.origin.declaration : undefined;
          const memberKind = callable === undefined || declaration === undefined ? "property" : host.memberKind(declaration);
          const signature = memberKind === "method" && callable?.calls.length === 1 ? callable.calls[0] : undefined;
          const typeParameters = signature === undefined ? [] : host.memberTypeParameters(signature);
          if (typeParameters === undefined) return undefined;
          members.push(Object.freeze({
            sourceKey: Object.freeze({ kind: "property", name: member.name }),
            sourceName: member.name,
            targetName: objectShapeMemberTargetName(member.name),
            memberKind,
            type: memberKind === "method" ? getCsharpMethodValue(type)?.contract ?? type : type,
            ...(typeParameters.length === 0 ? {} : { typeParameters }),
            optional: member.optional,
            origin: member.origin,
            ...(declaration === undefined ? {} : {
              sourceDeclarations: Object.freeze([declaration]),
              sourceSubjects: Object.freeze([declaration]),
            }),
            ...(member.readonly === undefined ? {} : { readonly: member.readonly }),
          }));
        }
        const kind = host.shapeKind(descriptor);
        if (kind === undefined) return undefined;
        const contract = kind === "contract";
        const targetType = createStructuralObjectShapeTarget(members, undefined, host.typeParameterConstraints, contract);
        const shape = host.retainShape(Object.freeze({ targetType, members: Object.freeze(members) }));
        if (shape === undefined || shape.members.length !== members.length) return undefined;
        if (members.length === 0) return targetTypeRefEquals(shape.targetType, targetType) ? shape.targetType : undefined;
        if (shape.targetType.kind !== "target-named") return undefined;
        const carrier: CsharpTargetNamedTypeRef = shape.targetType;
        if (carrier.csharpGeneratedStructuralStorage !== true || (carrier.csharpStructuralContract === true) !== contract) return undefined;
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
