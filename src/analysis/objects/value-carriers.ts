import { createCsharpNativeValueProducer, createCsharpObjectMethodSourceProducer } from "../program/records/native/native-value-carriers.js";
import { createHash } from "node:crypto";
import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceInstantiation } from "../program/source-facts.js";
import { csharpNativePropertyNameIssue } from "./computed-field-names.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type {
  CsharpNativeValueCarriers,
  CsharpNativeValueField,
  CsharpObjectMethodSourceCapture,
  CsharpObjectMethodSources,
} from "../../target-model/records/native/native-value-carriers.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/types/project-types.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/objects/required-records.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { csharpRuntimeRecordFieldTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpLexicalCaptures } from "../callables/values/lexical-captures.js";

export interface CsharpNativeValueTypeSelection {
  readonly facts: SourceProgramFacts;
  resolve(descriptor: SourceTypeDescriptor, occurrence: Node): TargetTypeRef | undefined;
}

export function analyzeCsharpNativeValueCarriers(
  ast: AstReader,
  nodes: readonly Node[],
  evidence: CsharpSourceEvidenceIndex,
  types: CsharpNativeValueTypeSelection,
  shapes: CsharpObjectShapeClassifications,
  requiredRecords: CsharpRequiredRecord[],
): CsharpNativeValueCarriers {
  const producer = createCsharpNativeValueProducer();
  const issues: CsharpProjectTypeIssue[] = [];
  const refuse = (node: Node, code: `CSHARP_${string}`, message: string): void => {
    issues.push(Object.freeze({ node, code, message }));
  };
  for (const node of nodes) {
    if (!ast.is.IsVariableDeclaration(node)) continue;
    const source = evidence.sourceStruct.get(node);
    if (source === undefined) continue;
    requireCsharpRecord(requiredRecords, { family: "nativeValueDeclaration", subject: node,
      construct: "native value declaration", producer: "analyzeCsharpNativeValueCarriers" });
    if (!source.valueType) {
      refuse(node, "CSHARP_STRUCT_DECLARATION_NOT_VALUE_TYPE", "Struct declaration emission requires a finalized value-type struct fact.");
      continue;
    }
    const declaration = ast.as.AsVariableDeclaration(node)!;
    const initializer = declaration.Initializer;
    const shapeNode = initializer !== undefined && ast.is.IsCallExpression(initializer)
      ? ast.arguments(initializer)[0] : undefined;
    if (shapeNode === undefined || !ast.is.IsObjectLiteralExpression(shapeNode)) {
      refuse(initializer ?? node, "CSHARP_STRUCT_SHAPE_NOT_OBJECT_LITERAL",
        "Struct declaration emission requires struct(...) to receive an object-literal field shape so C# value-type fields are proven before emission.");
      continue;
    }
    const start = issues.length;
    const fieldCalls = new Map<Node, Node | null>();
    for (const property of ast.properties(shapeNode)) {
      if (property === undefined) continue;
      const name = ast.name(property);
      if (name !== undefined) {
        const selected = types.facts.analyses.propertyName(name);
        if (selected === undefined && ast.is.IsComputedPropertyName(name)) failTargetAnalysisInvariant("tsonic-csharp",
          "A native computed field requires its completed checked property-name selection.", name);
        if (selected !== undefined) {
          const issue = csharpNativePropertyNameIssue(name, selected);
          if (issue !== undefined) {
            issues.push(Object.freeze({ node: name, code: issue.code, message: issue.message }));
            continue;
          }
        }
      }
      if (!ast.is.IsPropertyAssignment(property)) {
        refuse(property, "CSHARP_STRUCT_MEMBER_NOT_FIELD", "Value-type members require finalized field facts from field-marker property assignments.");
        continue;
      }
      const assignment = ast.as.AsPropertyAssignment(property)!;
      const field = evidence.sourceField.get([property, assignment.Initializer, ast.name(property)]);
      if (field === undefined) {
        refuse(property, "CSHARP_STRUCT_MEMBER_NOT_FIELD", "Value-type member requires a finalized field fact before C# struct emission.");
      } else if (assignment.Initializer !== undefined && ast.is.IsCallExpression(assignment.Initializer)) {
        fieldCalls.set(field.sourceType, fieldCalls.has(field.sourceType) ? null : assignment.Initializer);
      }
    }
    if (issues.length !== start) continue;
    const shape = shapes.resolveNode(node);
    const fields: CsharpNativeValueField[] = [];
    for (const field of source.fields) {
      const call = fieldCalls.get(field.sourceType);
      // The field marker's explicit type argument names the method binder at the same position; the carrier is that
      // binder's published instantiation (instantiations.at), never the checker-selected type.
      const instantiation = call == null ? undefined : sourceInstantiation(types.facts, call);
      const authored = call == null ? [] : ast.typeArguments(call);
      const matches = authored.flatMap((argument, index) => argument === field.sourceType ? [index] : []);
      const descriptor = instantiation !== undefined && instantiation.method.length === authored.length && matches.length === 1
        ? instantiation.method[matches[0]!]!.type : undefined;
      const carrier = descriptor === undefined || call == null ? undefined : types.resolve(descriptor, call);
      if (carrier === undefined) {
        refuse(field.sourceType, "CSHARP_STRUCT_FIELD_CARRIER_NOT_SELECTED", `Value-type field '${field.sourceName}' requires an exact selected native carrier before C# struct emission.`);
        continue;
      }
      if (csharpTargetTypeRenderingRejection(carrier) !== undefined) {
        refuse(field.sourceType, "CSHARP_STRUCT_FIELD_CARRIER_NOT_RENDERABLE", `Value-type field '${field.sourceName}' has no renderable selected native carrier.`);
        continue;
      }
      const member = shape?.members.find(candidate => candidate.sourceSubjects?.includes(field.sourceType));
      if (member?.bound === true && csharpTargetTypeRenderingRejection(csharpRuntimeRecordFieldTargetType(member.type)) !== undefined) {
        refuse(field.sourceType, "CSHARP_STRUCT_FIELD_CARRIER_NOT_RENDERABLE", "The bound value-type member has no renderable storage contract.");
        continue;
      }
      fields.push(Object.freeze({ source: field, carrier,
        ...(shape !== undefined && member?.bound === true ? { bound: Object.freeze({ owner: shape, member }) } : {}),
      }));
    }
    if (issues.length === start) producer.publish(node, Object.freeze({ source, fields: Object.freeze(fields) }));
  }
  return producer.seal(issues);
}

export function analyzeCsharpObjectMethodSources(
  ast: AstReader,
  nodes: readonly Node[],
  facts: SourceProgramFacts,
  callOnlyAlias: (declaration: Node) => object | undefined,
): CsharpObjectMethodSources {
  const producer = createCsharpObjectMethodSourceProducer();
  for (const literal of nodes) {
    if (!ast.is.IsObjectLiteralExpression(literal)) continue;
    const methods = ast.properties(literal).filter((method): method is Node =>
      method !== undefined && ast.is.IsMethodDeclaration(method) && ast.body(method) !== undefined);
    if (methods.length === 0) continue;
    const captures = new Map<Node, readonly CsharpObjectMethodSourceCapture[]>();
    for (const method of methods) {
      const lexical = csharpLexicalCaptures(facts, method);
      captures.set(method, Object.freeze(lexical.captures
        .filter(capture => callOnlyAlias(capture.declaration) === undefined)
        .flatMap(capture => capture.references[0] === undefined ? [] : [Object.freeze({
          declaration: capture.declaration, reference: capture.references[0],
          mutable: facts.navigation.uses.summary(capture.declaration).bindingWritten,
        })])));
    }
    const file = ast.getSourceFile(literal);
    const identity = createHash("sha256").update(JSON.stringify([
      ast.getFileName(file), ast.pos(literal), ast.end(literal),
    ])).digest("hex");
    producer.publish(literal, identity, captures);
  }
  return producer.seal();
}
