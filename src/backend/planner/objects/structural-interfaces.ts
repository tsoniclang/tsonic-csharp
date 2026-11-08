import type { CsharpObjectShapeFact, CsharpNativeCallableMember } from "../../../target-model/types/model.js";
import type {
  CsharpStructuralObjectEmissionRecords, CsharpStructuralMethodEmission, CsharpStructuralPropertyEmission,
} from "../../../target-model/records/objects/structural-object-emission.js";
import type { CsharpNativeMemberHidingReader } from "../../../target-model/records/native/native-member-names.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";
import type {
  CsharpGenericConstraint, CsharpInterfaceMember, CsharpInterfaceMethodDeclaration,
  CsharpInterfacePropertyDeclaration,
} from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { renderCsharpObjectMethodParameters } from "./method-signatures.js";

export function renderCsharpStructuralInterfaceMembers(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  records: CsharpStructuralObjectEmissionRecords & { readonly nativeMemberHiding: CsharpNativeMemberHidingReader },
): readonly CsharpInterfaceMember[] {
  const selected = records.structuralObject.get(shape);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted structural interface requires its sealed member inventory.", shape.methodImplementation?.declaration);
  return selected.members.map(member => member.kind === "method"
    ? renderMethod(typeParameterNames, shape, member.method, records.nativeMemberHiding)
    : renderProperty(typeParameterNames, shape, member.property, records.nativeMemberHiding));
}

export function renderCsharpStructuralInterfaceMethodValues(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  records: CsharpStructuralObjectEmissionRecords & { readonly nativeMemberHiding: CsharpNativeMemberHidingReader },
): readonly CsharpInterfacePropertyDeclaration[] {
  const selected = records.structuralObject.get(shape);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted structural interface requires its sealed method-value inventory.", shape.methodImplementation?.declaration);
  return selected.methodValues.map(property => renderProperty(typeParameterNames, shape, property, records.nativeMemberHiding));
}

export function renderCsharpStructuralMethod(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  member: CsharpNativeCallableMember,
  records: CsharpStructuralObjectEmissionRecords & { readonly nativeMemberHiding: CsharpNativeMemberHidingReader },
): CsharpInterfaceMethodDeclaration {
  const selected = records.structuralObject.get(shape)?.methods.get(member);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted native method requires its identical sealed physical signature.", shape.methodImplementation?.declaration);
  return renderMethod(typeParameterNames, shape, selected, records.nativeMemberHiding);
}

function renderMethod(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  method: CsharpStructuralMethodEmission,
  names: CsharpNativeMemberHidingReader,
): CsharpInterfaceMethodDeclaration {
  const subject = shape.methodImplementation?.declaration;
  const returnType = csharpTypeFromTargetTypeRef(method.returnType, typeParameterNames);
  if (returnType === undefined) failCsharpPlannerInvariant("An admitted native method requires its renderable return carrier.", subject);
  return { kind: "MethodDeclaration", name: method.name, returnType,
    ...(method.returnPassing === undefined ? {} : { returnPassing: method.returnPassing === "byref-readonly" ? "ref-readonly" : "ref" }),
    modifiers: planCsharpArtifactMemberHiding(names, shape, method.name),
    typeParameters: method.typeParameters.map(parameter => ({
      name: typeParameterNames?.get(parameter.identity) ?? parameter.name,
      constraints: parameter.constraints.map((constraint): CsharpGenericConstraint => {
        if (constraint.kind === "keyword") return { kind: "KeywordConstraint", keyword: constraint.keyword };
        if (constraint.kind === "constructor") return { kind: "ConstructorConstraint" };
        const type = csharpTypeFromTargetTypeRef(constraint.type, typeParameterNames);
        if (type === undefined) failCsharpPlannerInvariant("An admitted native method requires its renderable constraint.", parameter.declaration);
        return { kind: "TypeConstraint", type };
      }),
    })),
    parameters: renderCsharpObjectMethodParameters({ ...method, returnsVoid: false }, typeParameterNames, subject) };
}

function renderProperty(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  property: CsharpStructuralPropertyEmission,
  names: CsharpNativeMemberHidingReader,
): CsharpInterfacePropertyDeclaration {
  const type = csharpTypeFromTargetTypeRef(property.type, typeParameterNames);
  if (type === undefined) failCsharpPlannerInvariant("An admitted structural property requires its renderable carrier.", shape.methodImplementation?.declaration);
  return { kind: "PropertyDeclaration", name: property.name, type, writable: property.writable,
    modifiers: planCsharpArtifactMemberHiding(names, shape, property.name) };
}
