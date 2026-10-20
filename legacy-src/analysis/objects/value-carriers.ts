import { createHash } from "node:crypto";
import type { AstReader, Node } from "@tsonic/tsts";
import { sourceLexicalCaptures, type SourceCallOnlyAlias, type SourceFileSemantics, type SourceProgramNavigation } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpNativePropertyNameIssue } from "./computed-field-names.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type {
  CsharpNativeValueCarriers,
  CsharpNativeValueDeclaration,
  CsharpNativeValueField,
  CsharpObjectMethodSource,
  CsharpObjectMethodSourceCapture,
  CsharpObjectMethodSources,
} from "../../target-model/records/native-value-carriers.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { csharpRuntimeRecordFieldTargetType } from "../../target-model/types/carriers/runtime-carriers.js";

export function analyzeCsharpNativeValueCarriers(
  ast: AstReader,
  nodes: readonly Node[],
  evidence: CsharpSourceEvidenceIndex,
  values: CsharpValueReadClassifications,
  shapes: CsharpObjectShapeClassifications,
  semanticsFor: (node: Node) => SourceFileSemantics,
  requiredRecords: CsharpRequiredRecord[],
): CsharpNativeValueCarriers {
  const declarations = new WeakMap<Node, CsharpNativeValueDeclaration>();
  const issues: CsharpProjectTypeIssue[] = [];
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message }));
  };
  for (const node of nodes) {
    if (!ast.is.IsVariableDeclaration(node)) continue;
    const source = evidence.sourceStruct.get(node);
    if (source === undefined) continue;
    requireCsharpRecord(requiredRecords, { family: "nativeValueDeclaration", subject: node,
      construct: "native value declaration", producer: "analyzeCsharpNativeValueCarriers" });
    if (!source.valueType) {
      refuse(node, "Struct declaration emission requires a finalized value-type struct fact.");
      continue;
    }
    const declaration = ast.as.AsVariableDeclaration(node)!;
    const initializer = declaration.Initializer;
    const shapeNode = initializer !== undefined && ast.is.IsCallExpression(initializer)
      ? ast.arguments(initializer)[0] : undefined;
    if (shapeNode === undefined || !ast.is.IsObjectLiteralExpression(shapeNode)) {
      refuse(initializer ?? node,
        "Struct declaration emission requires struct(...) to receive an object-literal field shape so C# value-type fields are proven before emission.");
      continue;
    }
    const start = issues.length;
    for (const property of ast.properties(shapeNode)) {
      if (property === undefined) continue;
      const name = ast.name(property);
      if (name !== undefined) {
        const selected = semanticsFor(name).propertyNames.get(name);
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
        refuse(property, "Value-type members require finalized field facts from field-marker property assignments.");
        continue;
      }
      const assignment = ast.as.AsPropertyAssignment(property)!;
      if (evidence.sourceField.get([property, assignment.Initializer, ast.name(property)]) === undefined) {
        refuse(property, "Value-type member requires a finalized field fact before C# struct emission.");
      }
    }
    if (issues.length !== start) continue;
    const shape = shapes.resolveNode(node);
    const fields: CsharpNativeValueField[] = [];
    for (const field of source.fields) {
      const carrier = values.valueRead.get(field.sourceType)?.value;
      if (carrier === undefined) {
        refuse(field.sourceType, `Value-type field '${field.sourceName}' requires an exact selected native carrier before C# struct emission.`);
        continue;
      }
      if (csharpTargetTypeRenderingRejection(carrier) !== undefined) {
        refuse(field.sourceType, `Value-type field '${field.sourceName}' has no renderable selected native carrier.`);
        continue;
      }
      const member = shape?.members.find(candidate => candidate.sourceSubjects?.includes(field.sourceType));
      if (member?.bound === true && csharpTargetTypeRenderingRejection(csharpRuntimeRecordFieldTargetType(member.type)) !== undefined) {
        refuse(field.sourceType, "The bound value-type member has no renderable storage contract.");
        continue;
      }
      fields.push(Object.freeze({ source: field, carrier,
        ...(shape !== undefined && member?.bound === true ? { bound: Object.freeze({ owner: shape, member }) } : {}),
      }));
    }
    if (issues.length === start) declarations.set(node, Object.freeze({ source, fields: Object.freeze(fields) }));
  }
  return Object.freeze({ issues: Object.freeze(issues),
    nativeValueDeclaration: Object.freeze({ get: (declaration: Node) => declarations.get(declaration) }),
  });
}

export function analyzeCsharpObjectMethodSources(
  ast: AstReader,
  nodes: readonly Node[],
  navigation: SourceProgramNavigation,
  callOnlyAlias: (declaration: Node) => SourceCallOnlyAlias | undefined,
): CsharpObjectMethodSources {
  const literals = new WeakMap<Node, CsharpObjectMethodSource>();
  for (const literal of nodes) {
    if (!ast.is.IsObjectLiteralExpression(literal)) continue;
    const methods = ast.properties(literal).filter((method): method is Node =>
      method !== undefined && ast.is.IsMethodDeclaration(method) && ast.body(method) !== undefined);
    if (methods.length === 0) continue;
    const captures = new WeakMap<Node, readonly CsharpObjectMethodSourceCapture[]>();
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
    literals.set(literal, Object.freeze({ identity,
      captures: (method: Node) => captures.get(method),
    }));
  }
  return Object.freeze({ get: (literal: Node) => literals.get(literal) });
}
