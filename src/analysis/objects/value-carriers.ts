import { createCsharpNativeValueProducer, createCsharpObjectMethodSourceProducer } from "../program/records/native/native-value-carriers.js";
import { createHash } from "node:crypto";
import type { AstReader, Node } from "@tsonic/tsts";
import { sourceLexicalCaptures, type SourceCallOnlyAlias, type SourceProgramFacts } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
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

export function analyzeCsharpNativeValueCarriers(
  ast: AstReader, nodes: readonly Node[], evidence: CsharpSourceEvidenceIndex,
  shapes: CsharpObjectShapeClassifications, requiredRecords: CsharpRequiredRecord[],
): CsharpNativeValueCarriers {
  const producer = createCsharpNativeValueProducer();
  const issues: CsharpProjectTypeIssue[] = [];
  for (const node of nodes) {
    const source = evidence.sourceStruct.get(node);
    if (source === undefined) continue;
    requireCsharpRecord(requiredRecords, { family: "nativeValueDeclaration", subject: node,
      construct: "native value declaration", producer: "analyzeCsharpNativeValueCarriers" });
    if (!source.valueType) {
      issues.push({ node, code: "CSHARP_UNSUPPORTED_AST", message: "Native struct emission requires its exact Source value-type marker." });
      continue;
    }
    const shape = shapes.resolveNode(node);
    const fields: CsharpNativeValueField[] = [];
    const start = issues.length;
    for (const field of source.fields) {
      if (csharpTargetTypeRenderingRejection(field.carrier) !== undefined) {
        issues.push({ node: field.typeNode, code: "CSHARP_UNSUPPORTED_AST",
          message: `Native value field '${field.sourceName}' requires its exact renderable physical carrier.` });
        continue;
      }
      const matches = shape?.members.filter(member => member.sourceSubjects?.includes(field.typeNode)) ?? [];
      if (matches.length > 1) failTargetAnalysisInvariant("tsonic-csharp", "A Native field marker must select exactly one original physical field.", field.typeNode);
      const member = matches[0];
      if (member?.bound === true && csharpTargetTypeRenderingRejection(csharpRuntimeRecordFieldTargetType(member.type)) !== undefined) {
        issues.push({ node: field.typeNode, code: "CSHARP_UNSUPPORTED_AST", message: "The bound Native value member requires its exact renderable storage contract." });
        continue;
      }
      fields.push(Object.freeze({ source: field, carrier: field.carrier,
        ...(shape !== undefined && member?.bound === true ? { bound: Object.freeze({ owner: shape, member }) } : {}) }));
    }
    if (issues.length === start) producer.publish(node, Object.freeze({ source, fields: Object.freeze(fields) }));
  }
  return producer.seal(issues);
}

export function analyzeCsharpObjectMethodSources(
  ast: AstReader,
  nodes: readonly Node[],
  navigation: SourceProgramFacts["navigation"],
  callOnlyAlias: (declaration: Node) => SourceCallOnlyAlias | undefined,
): CsharpObjectMethodSources {
  const producer = createCsharpObjectMethodSourceProducer();
  for (const literal of nodes) {
    if (!ast.is.IsObjectLiteralExpression(literal)) continue;
    const methods = ast.properties(literal).filter((method): method is Node =>
      method !== undefined && ast.is.IsMethodDeclaration(method) && ast.body(method) !== undefined);
    if (methods.length === 0) continue;
    const captures = new Map<Node, readonly CsharpObjectMethodSourceCapture[]>();
    for (const method of methods) {
      const lexical = sourceLexicalCaptures(literal, [method], ast, navigation, "source");
      captures.set(method, Object.freeze(lexical.captures
        .filter(capture => callOnlyAlias(capture.declaration) === undefined)
        .flatMap(capture => capture.references[0] === undefined ? [] : [Object.freeze({
          declaration: capture.declaration, reference: capture.references[0],
          mutable: navigation.declarationUseSummary(capture.declaration).bindingWritten,
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
