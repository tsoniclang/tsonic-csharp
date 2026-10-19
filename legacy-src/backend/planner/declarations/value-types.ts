import type { CsharpPlanningContext } from "../context.js";
import {
  AsVariableDeclaration,
} from "@tsonic/target-api/source";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type { CsharpSourceField } from "../../../target-model/records/source-markers.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeMember, CsharpStructDeclaration, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { renderBoundRecordMember } from "../objects/declarations/members.js";
import { planAttributesForSubject } from "./attributes.js";
import { getCsharpTypeForNode, invalidCsharpType } from "../types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../types/target-type-object-shapes.js";
import { planCsharpNativeMemberHiding } from "./modifiers.js";
import { objectShapeBoundStorageMemberName } from "../../../target-model/names/object-members.js";

export function planValueTypeDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpStructDeclaration | undefined {
  const declaration = AsVariableDeclaration(input.program.source.ast, declarationNode)!;
  const selected = input.program.records.nativeValueDeclaration.get(declarationNode);
  if (selected === undefined) return failCsharpPlannerInvariant(
    "A value-type declaration requires its admitted native fields and storage carriers.", declarationNode);
  const members: CsharpTypeMember[] = [];
  for (const field of selected.fields) {
    const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(
      input, field.carrier, diagnostics, field.source.sourceType,
    );
    if (type === undefined) {
      return failCsharpPlannerInvariant("An admitted native value field lost its exact renderable selected carrier.", field.source.sourceType);
    }
    if (field.bound !== undefined) {
      const rendered = renderBoundRecordMember(input.scope.typeParameterNames, field.bound.owner, field.bound.member, type, {
        member: planCsharpNativeMemberHiding(input.program.names, { kind: "value", container: declarationNode,
          member: field.bound.member.targetName, role: "member" }),
        storage: planCsharpNativeMemberHiding(input.program.names, { kind: "value", container: declarationNode,
          member: objectShapeBoundStorageMemberName(field.bound.owner, field.bound.member), role: "member" }),
      });
      if (rendered.some(candidate => candidate === undefined)) {
        return failCsharpPlannerInvariant("An admitted bound native value field lost its renderable storage contract.", field.source.sourceType);
      }
      members.push(...rendered as readonly CsharpTypeMember[]);
      continue;
    }
    members.push({
      kind: "FieldDeclaration",
      name: field.source.sourceName,
      modifiers: ["public", ...(field.source.readonly ? ["readonly" as const] : []),
        ...planCsharpNativeMemberHiding(input.program.names,
          { kind: "value", container: declarationNode, member: field.source.sourceName, role: "member" })],
      type,
    });
  }
  return {
    kind: "StructDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousValueType", input, diagnostics, "Value type name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(declarationNode, sourceFile, input, diagnostics),
    members,
  };
}

export function getCsharpTypeForSourceField(
  field: CsharpSourceField,
  diagnosticLabel: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode {
  return getCsharpTypeForNode(
    field.sourceType,
    sourceFile,
    input,
    invalidCsharpType(`${diagnosticLabel} '${field.sourceName}' type`),
    diagnostics,
  );
}
