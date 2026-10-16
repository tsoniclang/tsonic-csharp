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
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../types/target-type-object-shapes.js";

export function planValueTypeDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpStructDeclaration {
  const declaration = AsVariableDeclaration(input.program.source.ast, declarationNode)!;
  const selected = input.program.records.nativeValueDeclaration.get(declarationNode);
  if (selected === undefined) return failCsharpPlannerInvariant(
    "A value-type declaration requires its admitted native fields and storage carriers.", declarationNode);
  return {
    kind: "StructDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousValueType", input, diagnostics, "Value type name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(declarationNode, sourceFile, input, diagnostics),
    members: selected.fields.flatMap((field): readonly CsharpTypeMember[] => {
      const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(
        input, field.carrier, diagnostics, field.source.sourceType,
      );
      if (type === undefined) return [];
      if (field.bound !== undefined) {
        const rendered = renderBoundRecordMember(input.scope.typeParameterNames, field.bound.owner, field.bound.member, type);
        if (rendered.some(candidate => candidate === undefined)) {
          diagnostics.push(unsupportedNodeDiagnostic(declarationNode, "The bound value-type member has no renderable storage contract."));
          return [];
        }
        return rendered as readonly CsharpTypeMember[];
      }
      return [{
      kind: "FieldDeclaration",
      name: field.source.sourceName,
      modifiers: field.source.readonly ? ["public", "readonly"] : ["public"],
      type,
    }];
    }),
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
