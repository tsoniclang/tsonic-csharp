import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectMemberRecords, CsharpObjectMemberEmission, CsharpObjectMethodSignature } from "../../../target-model/records/object-members.js";
import type { CsharpStructuralObjectEmissionRecords } from "../../../target-model/records/structural-object-emission.js";
import type { CsharpNativeMemberHidingReader } from "../../../target-model/records/native-member-names.js";
import type { CsharpNativeLayoutRecords } from "../../../target-model/records/native-layout-emission.js";
import type { CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeMember, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";
import { planCsharpNativeMemoryCall } from "../expressions/native-memory.js";
import {
  objectShapeAccessorGetterStorageMemberName, objectShapeAccessorSetterStorageMemberName,
  objectShapeStorageMemberName, objectShapeBoundStorageMemberName,
} from "../../../target-model/names/object-members.js";
import { renderCsharpStructuralMethod } from "./structural-interfaces.js";
import { renderCsharpDeferredCaptureMember } from "./deferred-captures.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { nullableCsharpType } from "../types/primitives.js";

export function renderObjectShapeMembers(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  records: CsharpObjectMemberRecords & CsharpStructuralObjectEmissionRecords & CsharpNativeLayoutRecords & { readonly nativeMemberHiding: CsharpNativeMemberHidingReader },
): readonly CsharpTypeMember[] {
  const selected = records.objectMemberDeclarations.get(shape);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted object requires its sealed native member inventory.", shape.methodImplementation?.declaration);
  return selected.flatMap(emission => renderMember(typeParameterNames, shape, emission, records));
}

function renderMember(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  emission: CsharpObjectMemberEmission,
  records: CsharpObjectMemberRecords & CsharpStructuralObjectEmissionRecords & CsharpNativeLayoutRecords & { readonly nativeMemberHiding: CsharpNativeMemberHidingReader },
): readonly CsharpTypeMember[] {
  const { member, declaration: selected } = emission;
  const subject = member.sourceDeclarations?.[0] ?? shape.methodImplementation?.declaration;
  const hiding = (name: string) => planCsharpArtifactMemberHiding(records.nativeMemberHiding, shape, name);
  const publicModifiers = (name: string, required = false) => ["public" as const, ...(required ? ["required" as const] : []), ...hiding(name)];
  const render = (carrier: TargetTypeRef) => renderCarrier(carrier, typeParameterNames, subject);
  switch (selected.kind) {
    case "authored": {
      const value = selected.value;
      if (value.kind === "fixed") return [];
      const method = renderCsharpStructuralMethod(typeParameterNames, shape, member, records);
      const type = render(value.type);
      const stored: CsharpExpression = { kind: "IdentifierName", name: value.valueName };
      const original: CsharpExpression = { kind: "IdentifierName", name: value.kind === "protocol" ? "this" : selected.bodyName };
      const initialized = value.kind === "protocol" && value.initializedName !== undefined
        ? { kind: "IdentifierName" as const, name: value.initializedName } : undefined;
      const notWritten: CsharpExpression = initialized === undefined
        ? { kind: "NullPatternExpression", expression: stored, negated: false }
        : { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: initialized };
      const getter: CsharpExpression = value.kind === "delegate"
        ? { kind: "AssignmentExpression", operatorToken: { kind: "QuestionQuestionEqualsToken" }, left: stored, right: original }
        : initialized === undefined
          ? { kind: "BinaryExpression", operatorToken: { kind: "QuestionQuestionToken" }, left: stored, right: original }
          : { kind: "ConditionalExpression", condition: initialized, whenTrue: stored, whenFalse: original };
      const arguments_ = method.parameters.map(parameter => ({ kind: "Argument" as const,
        expression: { kind: "IdentifierName" as const, name: parameter.name },
        ...(parameter.passing === undefined ? {} : { passing: parameter.passing }) }));
      const typeArguments = (method.typeParameters ?? []).map(parameter => ({ kind: "IdentifierName" as const, name: parameter.name }));
      const direct: CsharpExpression = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "this" }, name: selected.bodyName, typeArguments }, arguments: arguments_ };
      const present: CsharpExpression = { kind: "PostfixUnaryExpression", operand: stored, operatorToken: { kind: "ExclamationToken" } };
      const indirect: CsharpExpression = { kind: "InvocationExpression", callee: value.kind === "delegate" ? present
        : { kind: "SimpleMemberAccessExpression", receiver: present, name: member.targetName, typeArguments }, arguments: arguments_ };
      const complete = (expression: CsharpExpression): readonly CsharpStatement[] => selected.signature.returnsVoid
        ? [{ kind: "ExpressionStatement", expression }, { kind: "ReturnStatement" }]
        : [{ kind: "ReturnStatement", expression }];
      return [
        { kind: "FieldDeclaration", name: value.valueName, type: nullableCsharpType(type), modifiers: ["private", ...hiding(value.valueName)] },
        ...(initialized === undefined || value.kind !== "protocol" || value.initializedName === undefined ? [] : [
          { kind: "FieldDeclaration" as const, name: value.initializedName, type: { kind: "PredefinedType" as const, name: "bool" },
            modifiers: ["private" as const, ...hiding(value.initializedName)] },
        ]),
        { kind: "PropertyDeclaration", name: value.name, type, modifiers: publicModifiers(value.name),
          getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: getter }] },
          setter: { kind: "Block", statements: [
            { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" }, left: stored,
              right: { kind: "IdentifierName", name: "value" } } },
            ...(initialized === undefined ? [] : [{ kind: "ExpressionStatement" as const,
              expression: { kind: "AssignmentExpression" as const, operatorToken: { kind: "EqualsToken" as const }, left: initialized,
                right: { kind: "LiteralExpression" as const, value: true } } }]),
          ] } },
        { ...method, modifiers: publicModifiers(member.targetName), body: { kind: "Block", statements: [
          { kind: "IfStatement", condition: notWritten, thenBody: { kind: "Block", statements: complete(direct) } },
          ...complete(indirect),
        ] } },
      ];
    }
    case "copied": {
      const method = renderCsharpStructuralMethod(typeParameterNames, shape, member, records);
      const name = objectShapeStorageMemberName(shape, member);
      const call: CsharpExpression = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name }, name: member.targetName,
        typeArguments: (member.typeParameters ?? []).map(parameter => render({ kind: "type-parameter", identity: parameter.identity, name: parameter.name })) },
        arguments: method.parameters.map(parameter => ({ kind: "Argument", expression: { kind: "IdentifierName", name: parameter.name } })) };
      return [{ kind: "FieldDeclaration", name, type: render(selected.storage), modifiers: publicModifiers(name, true) },
        { ...method, modifiers: publicModifiers(member.targetName), body: { kind: "Block", statements: [
          selected.signature.returnsVoid ? { kind: "ExpressionStatement", expression: call } : { kind: "ReturnStatement", expression: call },
        ] } }];
    }
    case "optional-method": {
      const name = objectShapeStorageMemberName(shape, member);
      return [{ kind: "FieldDeclaration", name, type: render(selected.type), modifiers: publicModifiers(name) }];
    }
    case "deferred": return renderCsharpDeferredCaptureMember(member.targetName, render(selected.type), shape, records.nativeMemberHiding);
    case "method": {
      const name = objectShapeStorageMemberName(shape, member);
      const parameters = renderParameters(selected.signature, typeParameterNames, subject);
      const call: CsharpExpression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name },
        arguments: parameters.map(parameter => ({ kind: "Argument" as const, expression: { kind: "IdentifierName" as const, name: parameter.name } })) };
      return [{ kind: "FieldDeclaration", name, modifiers: publicModifiers(name, member.optional !== true), type: render(selected.storage) },
        { kind: "MethodDeclaration", name: member.targetName, modifiers: publicModifiers(member.targetName), returnType: render(selected.signature.returnType),
          parameters, body: { kind: "Block", statements: [selected.signature.returnsVoid
            ? { kind: "ExpressionStatement", expression: call } : { kind: "ReturnStatement", expression: call }] } }];
    }
    case "accessor": {
      const getterName = objectShapeAccessorGetterStorageMemberName(shape, member);
      const setterName = objectShapeAccessorSetterStorageMemberName(shape, member);
      const self: CsharpExpression = { kind: "IdentifierName", name: "this" };
      return [{ kind: "FieldDeclaration", name: getterName, modifiers: publicModifiers(getterName, true), type: render(selected.getter) },
        ...(selected.setter === undefined ? [] : [{ kind: "FieldDeclaration" as const, name: setterName,
          modifiers: publicModifiers(setterName, true), type: render(selected.setter) }]),
        { kind: "PropertyDeclaration", name: member.targetName, modifiers: publicModifiers(member.targetName), type: render(selected.type),
          getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: invoke(getterName, [self]) }] },
          ...(selected.setter === undefined ? {} : { setter: { kind: "Block" as const, statements: [
            { kind: "ExpressionStatement" as const, expression: invoke(setterName, [self, { kind: "IdentifierName", name: "value" }]) },
          ] } }) }];
    }
    case "bound": return renderBoundRecordMember(typeParameterNames, shape, member, render(selected.type), records,
      { member: hiding(member.targetName), storage: hiding(objectShapeBoundStorageMemberName(shape, member)) });
    case "native-backing": {
      const type = render(selected.type);
      const initializer = planCsharpNativeMemoryCall(typeParameterNames, "Allocate", { kind: "DefaultExpression", type }, selected.layout, records);
      if (initializer === undefined) failCsharpPlannerInvariant("An admitted native object backing requires its exact allocation syntax.", subject);
      const location: CsharpExpression = { kind: "IdentifierName", name: selected.name };
      const access = (name: string, arguments_: readonly CsharpExpression[]): CsharpExpression => ({
        kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: location, name },
        arguments: arguments_.map(expression => ({ kind: "Argument", expression })) });
      return [{ kind: "PropertyDeclaration", name: selected.name, type: render(selected.location),
        modifiers: publicModifiers(selected.name), autoGetter: true, initializer },
        { kind: "PropertyDeclaration", name: member.targetName, type, modifiers: publicModifiers(member.targetName, true),
          getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: access("Load", []) }] },
          setter: { kind: "Block", statements: [{ kind: "ExpressionStatement", expression: access("Store", [{ kind: "IdentifierName", name: "value" }]) }] } }];
    }
    case "property": return [{ kind: "PropertyDeclaration", name: member.targetName, modifiers: publicModifiers(member.targetName, selected.required),
      type: render(selected.type), autoGetter: true, autoSetter: true }];
    case "field": return [{ kind: "FieldDeclaration", name: member.targetName, modifiers: publicModifiers(member.targetName, selected.required), type: render(selected.type) }];
  }
}

export function renderBoundRecordMember(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  shape: CsharpObjectShapeFact,
  member: CsharpObjectShapeMemberFact,
  type: CsharpTypeNode,
  records: CsharpObjectMemberRecords,
  hiding: { readonly member: readonly "new"[]; readonly storage: readonly "new"[] },
): readonly CsharpTypeMember[] {
  const selected = records.objectMember.get(shape, member)?.boundStorage;
  const subject = member.sourceDeclarations?.[0] ?? shape.methodImplementation?.declaration;
  if (selected === undefined) failCsharpPlannerInvariant("An admitted bound native field requires its sealed storage carrier.", subject);
  const storageType = renderCarrier(selected, typeParameterNames, subject);
  const name = objectShapeBoundStorageMemberName(shape, member);
  const access: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name }, name: "Value" };
  return [{ kind: "FieldDeclaration", name, type: storageType, modifiers: ["public", ...hiding.storage] },
    { kind: "PropertyDeclaration", name: member.targetName, type, modifiers: ["public", ...hiding.member],
      getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: access }] },
      ...(member.readonly ? {} : { setter: { kind: "Block" as const, statements: [{ kind: "ExpressionStatement" as const,
        expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" }, left: access, right: { kind: "IdentifierName", name: "value" } } as CsharpExpression }] } }) }];
}

function invoke(name: string, arguments_: readonly CsharpExpression[]): CsharpExpression {
  return { kind: "InvocationExpression", callee: { kind: "IdentifierName", name }, arguments: arguments_.map(expression => ({ kind: "Argument", expression })) };
}

function renderCarrier(carrier: TargetTypeRef, names: ReadonlyMap<string, string> | undefined, subject: Node | undefined): CsharpTypeNode {
  const type = csharpTypeFromTargetTypeRef(carrier, names);
  if (type === undefined) failCsharpPlannerInvariant("An admitted object member requires its renderable native carrier.", subject);
  return type;
}

function renderParameters(signature: CsharpObjectMethodSignature, names: ReadonlyMap<string, string> | undefined, subject: Node | undefined): readonly CsharpParameter[] {
  return signature.parameters.map((parameter, index) => {
    const type = renderCarrier(parameter.type, names, subject);
    return { name: `arg${index}`, type, ...(parameter.rest ? { isParams: true } : {}),
      ...(parameter.optional ? { defaultValue: { kind: "DefaultExpression" as const, type } } : {}) };
  });
}
