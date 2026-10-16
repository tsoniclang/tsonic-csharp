import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import {
  AsBinaryExpression,
  AsBindingElement,
  AsBindingPattern,
  AsForInOrOfStatement,
  AsObjectLiteralExpression,
  AsParameterDeclaration,
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  AsSpreadAssignment,
  AsSpreadElement,
  AsStringLiteral,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindArrayLiteralExpression,
  KindBinaryExpression,
  KindEqualsToken,
  KindForOfStatement,
  KindIdentifier,
  KindObjectBindingPattern,
  KindObjectLiteralExpression,
  KindOmittedExpression,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindSpreadElement,
  KindStringLiteral,
  KindVariableDeclarationList,
  Node_Expression,
  Node_Text,
} from "@tsonic/target-api/source";
import type { CsharpObjectShapeClassifications } from "../objects/model.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpNativeParticipationInput } from "../../target-model/records/native-demand.js";
import type {
  CsharpBindingElementProjection,
  CsharpBindingPatternClassifications,
  CsharpBindingPatternIssue,
  CsharpBindingPatternSource,
  CsharpBindingProjectionFact,
  CsharpDestructuringAssignmentArrayElement,
  CsharpDestructuringAssignmentObjectElement,
  CsharpDestructuringAssignmentPattern,
  CsharpDestructuringAssignmentTarget,
} from "../../target-model/records/value-projections.js";
import { selectCsharpBindingPatternProjection } from "../../policy/types/objects/binding-projection-policy.js";
import { csharpBindingDefaultCarrier } from "../../target-model/types/binding-normalization.js";
import {
  isCsharpNeverTargetType,
  isCsharpVoidTargetType,
} from "../../target-model/types/index.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/index.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export interface CsharpBindingPatternAnalysisInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly participation: CsharpNativeParticipationInput["participation"];
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
  readonly valueReads: CsharpValueReadClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications;
}

export interface CsharpBindingPatternCandidate extends CsharpBindingPatternIssue {
  readonly root: Node;
}

export interface CsharpBindingPatternAnalysis extends CsharpBindingPatternClassifications {
  readonly candidates: readonly CsharpBindingPatternCandidate[];
  readonly entries: readonly { readonly node: Node; readonly root: Node; readonly fact: CsharpBindingProjectionFact }[];
}

export function admitCsharpBindingPatterns(
  patterns: CsharpBindingPatternAnalysis,
  requiredRoots: readonly Node[],
  requiredRecords: CsharpRequiredRecord[],
): CsharpBindingPatternClassifications & { readonly issues: readonly CsharpBindingPatternIssue[] } {
  const required = new Set(requiredRoots);
  const published = new Map<Node, CsharpBindingProjectionFact>();
  for (const entry of patterns.entries) {
    if (!required.has(entry.root)) continue;
    requireCsharpRecord(requiredRecords, { family: "bindingPatternProjection", subject: entry.node,
      construct: "consumed native binding pattern", producer: "admitCsharpBindingPatterns" });
    published.set(entry.node, entry.fact);
  }
  return Object.freeze({
    bindingPatternProjection: Object.freeze({ get: (node: Node) => published.get(node) }),
    issues: Object.freeze(patterns.candidates.filter(candidate => required.has(candidate.root))),
  });
}

export function isCsharpUnusedTupleDefault(
  ast: AstReader,
  bindingPatternProjection: CsharpBindingPatternClassifications["bindingPatternProjection"],
  node: Node,
): boolean {
  const owner = ast.parent(node);
  const element = owner === undefined ? undefined : bindingPatternProjection.get(owner)?.element;
  if (owner === undefined || element?.kind !== "array-element" || element.tupleDefault?.kind !== "unused") return false;
  return (AsBindingElement(ast, owner)?.Initializer ?? AsBinaryExpression(ast, owner)?.Right) === node;
}

const unprovenCarrierReason =
  "C# runtime representation is not proven by authored source facts, the selected source profile, project declarations, or an exact provider relation.";
const unprovenCarrierEvidence = "C# type policy found no exact runtime representation.";

export function analyzeCsharpBindingPatterns(
  input: CsharpBindingPatternAnalysisInput,
): CsharpBindingPatternAnalysis {
  const { ast } = input;
  const facts = new Map<Node, CsharpBindingProjectionFact>();
  const roots = new Map<Node, Node>();
  const lookup = Object.freeze({ get: (node: Node) => facts.get(node) });
  const candidates: CsharpBindingPatternCandidate[] = [];
  const assignmentDefaults = new WeakSet<Node>();
  let root: Node | undefined;
  for (const sourceFile of input.sourceFiles) visit(sourceFile, sourceFile);
  return Object.freeze({
    bindingPatternProjection: lookup,
    candidates: Object.freeze(candidates),
    entries: Object.freeze([...facts].map(([node, fact]) => Object.freeze({ node, fact, root: roots.get(node)! }))),
  });

  function visit(node: Node, sourceFile: SourceFile): void {
    if (input.evidence.compileTimeMetadata.get(node) || input.operations.nativeUnreachable.get(node) ||
      input.participation.get(node) === "erased" || isCsharpUnusedTupleDefault(ast, lookup, node)) return;
    if (ast.is.IsVariableDeclaration(node)) {
      const variable = AsVariableDeclaration(ast, node);
      const name = variable?.name;
      if (name !== undefined && isBindingPattern(name)) {
        const forOf = forOfHeadStatement(node);
        if (forOf !== undefined) {
          root = forOf;
          analyzePattern(name, node, sourceFile, undefined);
        } else if (variable?.Initializer !== undefined) {
          root = node;
          admitSource(name, variable.Initializer, sourceFile, "Destructuring source expression");
          if (completesWithValue(variable.Initializer)) analyzePattern(name, variable.Initializer, sourceFile, undefined);
        }
      }
    } else if (ast.is.IsParameterDeclaration(node)) {
      const name = AsParameterDeclaration(ast, node)?.name;
      const owner = ast.parent(node);
      const ownerParticipation = owner === undefined ? undefined : input.participation.get(owner);
      if (name !== undefined && isBindingPattern(name) && ownerParticipation !== undefined && ownerParticipation !== "erased") {
        root = node;
        analyzePattern(name, node, sourceFile, undefined);
      }
    } else if (ast.is.IsBinaryExpression(node) && !assignmentDefaults.has(node)) {
      root = node;
      analyzeAssignment(node, sourceFile);
    }
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child, sourceFile); });
  }

  function completesWithValue(source: Node): boolean {
    const carrier = input.valueReads.valueRead.get(source)?.value;
    return !isCsharpNeverTargetType(carrier) && !isCsharpVoidTargetType(carrier);
  }

  function isBindingPattern(node: Node): boolean {
    return HasSourceKind(ast, node, KindArrayBindingPattern) || HasSourceKind(ast, node, KindObjectBindingPattern);
  }

  function forOfHeadStatement(declaration: Node): Node | undefined {
    const list = ast.parent(declaration);
    const statement = list === undefined ? undefined : ast.parent(list);
    return list !== undefined && statement !== undefined &&
      HasSourceKind(ast, list, KindVariableDeclarationList) &&
      HasSourceKind(ast, statement, KindForOfStatement) &&
      AsForInOrOfStatement(ast, statement)?.Initializer === list ? statement : undefined;
  }

  function issue(node: Node, message: string, evidence: readonly string[] = []): void {
    const patternRoot = root;
    if (patternRoot === undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "A binding-pattern candidate issue was recorded outside its pattern root.", node);
    }
    candidates.push(Object.freeze({ node, root: patternRoot, code: "CSHARP_UNSUPPORTED_AST", message,
      evidence: Object.freeze([...new Set(evidence)]) }));
  }

  function recordSource(node: Node, source: CsharpBindingPatternSource): void {
    if (root === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A binding projection requires its checked root.", node);
    roots.set(node, root);
    facts.set(node, Object.freeze({ ...facts.get(node), source: Object.freeze(source) }));
  }

  function recordElement(node: Node, element: CsharpBindingElementProjection): void {
    if (root === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A binding element requires its checked root.", node);
    roots.set(node, root);
    facts.set(node, Object.freeze({ ...facts.get(node), element: Object.freeze(element) }));
  }

  function carrierDetail(sourceNode: Node, defaultReason: string): { readonly reason: string; readonly evidence: readonly string[] } {
    return input.valueReads.valueRead.get(sourceNode)?.value === undefined
      ? { reason: unprovenCarrierReason, evidence: [unprovenCarrierEvidence] }
      : { reason: defaultReason, evidence: [] };
  }

  function admitSource(diagnosticNode: Node, source: Node, sourceFile: SourceFile, description: string): void {
    if (input.valueReads.valueRead.get(source)?.value !== undefined) return;
    if (input.objectShapes.resolveNode(source, sourceFile) !== undefined) return;
    issue(diagnosticNode,
      `${description} requires a finalized runtime carrier fact before C# emission. ${unprovenCarrierReason}`,
      [unprovenCarrierEvidence]);
  }

  function analyzeNested(name: Node, elementNode: Node, sourceFile: SourceFile, carrier: TargetTypeRef | undefined): void {
    if (isBindingPattern(name)) analyzePattern(name, elementNode, sourceFile, carrier);
  }

  function analyzePattern(pattern: Node, sourceNode: Node, sourceFile: SourceFile, sourceCarrierOverride: TargetTypeRef | undefined): void {
    if (HasSourceKind(ast, pattern, KindArrayBindingPattern)) {
      analyzeArrayPattern(pattern, sourceNode, sourceFile, sourceCarrierOverride);
    } else if (HasSourceKind(ast, pattern, KindObjectBindingPattern)) {
      analyzeObjectPattern(pattern, sourceNode, sourceFile);
    }
  }

  function analyzeArrayPattern(pattern: Node, sourceNode: Node, sourceFile: SourceFile, sourceCarrierOverride: TargetTypeRef | undefined): void {
    const sourceCarrier = sourceCarrierOverride ?? input.valueReads.valueRead.get(sourceNode)?.value;
    const selected = selectCsharpBindingPatternProjection({ kind: "array-source", carrier: sourceCarrier });
    if (selected.kind !== "source" || selected.source.kind !== "array-source") {
      const detail = carrierDetail(sourceNode, "Runtime carrier fact is missing for the array destructuring source expression.");
      issue(pattern, `Array destructuring requires a finalized provider array or tuple runtime-carrier fact for the source expression. ${detail.reason}`, detail.evidence);
      return;
    }
    recordSource(pattern, selected.source);
    const { bindingCarrier } = selected.source;
    const elements = AsBindingPattern(ast, pattern)?.Elements?.Nodes ?? [];
    for (const [index, elementNode] of elements.entries()) {
      const element = elementNode === undefined ? undefined : AsBindingElement(ast, elementNode);
      if (elementNode === undefined || element === undefined) continue;
      const name = element.name;
      if (name === undefined) continue;
      const projection = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: bindingCarrier,
        index, rest: element.DotDotDotToken !== undefined, hasDefault: element.Initializer !== undefined });
      if (projection.kind !== "element") continue;
      recordElement(elementNode, projection.element);
      if (projection.element.kind === "array-rest" || projection.element.kind === "tuple-rest") {
        analyzeNested(name, elementNode, sourceFile, projection.element.restCarrier);
        continue;
      }
      if (projection.element.kind !== "array-element") continue;
      const { elementCarrier, tupleDefault } = projection.element;
      if (elementCarrier === undefined) continue;
      if (element.Initializer === undefined) {
        analyzeNested(name, elementNode, sourceFile, elementCarrier);
      } else if (tupleDefault !== undefined) {
        analyzeNested(name, elementNode, sourceFile, tupleDefault.kind === "planned" ? tupleDefault.carrier : elementCarrier);
      } else if (bindingCarrier.kind === "array") {
        const defaultValue = input.evidence.nodeTargetType.get(element.Initializer);
        if (defaultValue !== undefined) {
          analyzeNested(name, elementNode, sourceFile, csharpBindingDefaultCarrier(bindingCarrier.element, defaultValue));
        }
      }
    }
  }

  function analyzeObjectPattern(pattern: Node, sourceNode: Node, sourceFile: SourceFile): void {
    const shape = input.objectShapes.resolveNode(sourceNode, sourceFile);
    const selected = selectCsharpBindingPatternProjection({ kind: "object-source", shape,
      sourceOwned: input.evidence.sourceOwnedProjectShape.get(sourceNode) === true });
    if (selected.kind === "source" && selected.source.kind === "object-shape-source") {
      analyzeObjectShapePattern(pattern, selected.source.shape, sourceFile);
      return;
    }
    if (selected.kind === "source" && selected.source.kind === "source-owned-source") {
      analyzeSourceOwnedPattern(pattern, sourceFile);
      return;
    }
    issue(pattern, "Object destructuring requires an exact source-owned declaration or target object-shape policy.");
  }

  function objectShapePropertyName(elementNode: Node): { readonly node: Node; readonly sourceName?: string } | undefined {
    const element = AsBindingElement(ast, elementNode);
    const propertyName = element?.PropertyName ?? element?.name;
    if (propertyName === undefined) return undefined;
    return HasSourceKind(ast, propertyName, KindIdentifier) || HasSourceKind(ast, propertyName, KindStringLiteral)
      ? { node: propertyName, sourceName: Node_Text(ast, propertyName) }
      : { node: propertyName };
  }

  function analyzeObjectShapePattern(pattern: Node, shape: CsharpObjectShapeFact, sourceFile: SourceFile): void {
    recordSource(pattern, { kind: "object-shape-source", shape });
    const elements = AsBindingPattern(ast, pattern)?.Elements?.Nodes ?? [];
    const extractedSourceNames = new Set<string>();
    for (const elementNode of elements) {
      const element = elementNode === undefined ? undefined : AsBindingElement(ast, elementNode);
      if (elementNode === undefined || element === undefined || element.DotDotDotToken !== undefined) continue;
      const sourceName = objectShapePropertyName(elementNode)?.sourceName;
      if (sourceName !== undefined) extractedSourceNames.add(sourceName);
    }
    for (const elementNode of elements) {
      const element = elementNode === undefined ? undefined : AsBindingElement(ast, elementNode);
      if (elementNode === undefined || element === undefined) continue;
      const name = element.name;
      if (element.DotDotDotToken !== undefined) {
        if (name === undefined || !HasSourceKind(ast, name, KindIdentifier)) continue;
        analyzeObjectShapeRest(elementNode, name, shape, extractedSourceNames, sourceFile);
        continue;
      }
      if (name === undefined) continue;
      const property = objectShapePropertyName(elementNode);
      if (property?.sourceName === undefined) {
        if (property !== undefined) issue(property.node, "Object destructuring from object-shape facts supports only identifier or string-literal property names.");
        issue(elementNode, "Object destructuring property must match a finalized provider object-shape member.");
        continue;
      }
      const selected = selectCsharpBindingPatternProjection({ kind: "object-member", shape, sourceName: property.sourceName,
        description: "Object destructuring property" });
      if (selected.kind !== "element" || selected.element.kind !== "object-shape-member") {
        if (selected.kind === "unresolved") for (const reason of selected.reasons) issue(elementNode, reason);
        continue;
      }
      const { member } = selected.element;
      recordElement(elementNode, selected.element);
      if (element.Initializer === undefined) {
        analyzeNested(name, elementNode, sourceFile, member.type);
        continue;
      }
      const defaultValue = input.evidence.nodeTargetType.get(element.Initializer);
      if (defaultValue !== undefined) {
        analyzeNested(name, elementNode, sourceFile, csharpBindingDefaultCarrier(member.type, defaultValue));
      }
    }
  }

  function analyzeObjectShapeRest(
    elementNode: Node,
    name: Node,
    sourceShape: CsharpObjectShapeFact,
    extractedSourceNames: ReadonlySet<string>,
    sourceFile: SourceFile,
  ): void {
    const restContract = input.objectShapes.resolveNode(name, sourceFile);
    const restShape = restContract === undefined ? undefined : input.objectShapes.resolveCopyShape(restContract);
    if (restShape === undefined) {
      issue(elementNode, "Object rest destructuring requires finalized provider object-shape facts for the rest binding.");
      return;
    }
    recordObjectRest(elementNode, restShape, sourceShape, extractedSourceNames, "Object rest destructuring");
  }

  function recordObjectRest(
    elementNode: Node,
    restShape: CsharpObjectShapeFact,
    sourceShape: CsharpObjectShapeFact,
    extractedSourceNames: ReadonlySet<string>,
    description: string,
  ): void {
    const selected = selectCsharpBindingPatternProjection({ kind: "object-rest", source: sourceShape, rest: restShape,
      extractedNames: extractedSourceNames, description });
    if (selected.kind === "element") recordElement(elementNode, selected.element);
    else if (selected.kind === "unresolved") for (const reason of selected.reasons) issue(elementNode, reason);
  }

  function analyzeSourceOwnedPattern(pattern: Node, sourceFile: SourceFile): void {
    recordSource(pattern, { kind: "source-owned-source" });
    const elements = AsBindingPattern(ast, pattern)?.Elements?.Nodes ?? [];
    for (const elementNode of elements) {
      const element = elementNode === undefined ? undefined : AsBindingElement(ast, elementNode);
      if (elementNode === undefined || element === undefined) continue;
      const name = element.name;
      if (name === undefined) continue;
      const propertyName = element.PropertyName ?? name;
      const identifier = HasSourceKind(ast, propertyName, KindIdentifier);
      const sourceName = identifier ? Node_Text(ast, propertyName)
        : HasSourceKind(ast, propertyName, KindStringLiteral) ? Node_Text(ast, AsStringLiteral(ast, propertyName)) : undefined;
      const selected = selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName, stringLiteral: !identifier,
        rest: element.DotDotDotToken !== undefined, hasDefault: element.Initializer !== undefined });
      if (selected.kind !== "element") {
        if (selected.kind === "unresolved" && selected.reasons.length > 0) {
          for (const reason of selected.reasons) issue(element.DotDotDotToken !== undefined ? elementNode : element.Initializer ?? propertyName, reason);
        } else issue(propertyName, "Object destructuring from source-owned declarations supports only identifier property names until provider object-shape facts supply target member names.");
        continue;
      }
      recordElement(elementNode, selected.element);
      analyzeNested(name, elementNode, sourceFile, undefined);
    }
  }

  function analyzeAssignment(node: Node, sourceFile: SourceFile): void {
    const selected = input.operations.binaryOperation.get(node)?.destructuring;
    if (selected?.kind !== "resolved") return;
    const pattern = assignmentPattern(selected.pattern);
    if (pattern === undefined) {
      issue(selected.pattern, "Destructuring assignment target is outside the current C# planning surface.");
      return;
    }
    if (root === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A destructuring assignment requires its checked root.", node);
    roots.set(node, root);
    facts.set(node, Object.freeze({ ...facts.get(node), assignmentPattern: pattern }));
    if (!completesWithValue(selected.source)) return;
    admitSource(selected.pattern, selected.source, sourceFile, "Destructuring assignment source");
    analyzeAssignmentPattern(pattern, selected.source, sourceFile, input.valueReads.valueRead.get(selected.source)?.value);
  }

  function analyzeAssignmentPattern(
    pattern: CsharpDestructuringAssignmentPattern,
    sourceNode: Node,
    sourceFile: SourceFile,
    sourceCarrier: TargetTypeRef | undefined,
  ): void {
    if (root === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An assignment projection requires its checked root.", pattern.sourceNode);
    roots.set(pattern.sourceNode, root);
    facts.set(pattern.sourceNode, Object.freeze({ ...facts.get(pattern.sourceNode), assignmentPattern: pattern }));
    if (pattern.kind === "array") {
      analyzeArrayAssignmentPattern(pattern, sourceNode, sourceFile, sourceCarrier);
    } else {
      analyzeObjectAssignmentPattern(pattern, sourceNode, sourceFile);
    }
  }

  function analyzeArrayAssignmentPattern(
    pattern: Extract<CsharpDestructuringAssignmentPattern, { readonly kind: "array" }>,
    sourceNode: Node,
    sourceFile: SourceFile,
    sourceCarrier: TargetTypeRef | undefined,
  ): void {
    const selected = selectCsharpBindingPatternProjection({ kind: "array-source", carrier: sourceCarrier });
    if (selected.kind !== "source" || selected.source.kind !== "array-source") {
      const detail = carrierDetail(sourceNode, "Runtime carrier fact is missing for the array destructuring assignment source expression.");
      issue(pattern.sourceNode, `Array destructuring assignment requires a finalized provider array or tuple runtime-carrier fact for the source expression. ${detail.reason}`, detail.evidence);
      return;
    }
    recordSource(pattern.sourceNode, selected.source);
    const { bindingCarrier } = selected.source;
    for (const [index, element] of pattern.elements.entries()) {
      if (element === undefined) continue;
      const projection = selectCsharpBindingPatternProjection({ kind: "array-element", carrier: bindingCarrier,
        index, rest: element.rest, hasDefault: element.initializer !== undefined });
      if (projection.kind !== "element") continue;
      recordElement(element.sourceNode, projection.element);
      if (projection.element.kind === "array-rest" || projection.element.kind === "tuple-rest") {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, projection.element.restCarrier);
        continue;
      }
      if (projection.element.kind !== "array-element") continue;
      const { elementCarrier, tupleDefault } = projection.element;
      if (elementCarrier === undefined) continue;
      if (element.initializer === undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, elementCarrier);
      } else if (tupleDefault !== undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, tupleDefault.kind === "planned" ? tupleDefault.carrier : elementCarrier);
      } else if (bindingCarrier.kind === "array") {
        const defaultValue = input.evidence.nodeTargetType.get(element.initializer);
        if (defaultValue !== undefined) {
          analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, csharpBindingDefaultCarrier(bindingCarrier.element, defaultValue));
        }
      }
    }
  }

  function analyzeObjectAssignmentPattern(
    pattern: Extract<CsharpDestructuringAssignmentPattern, { readonly kind: "object" }>,
    sourceNode: Node,
    sourceFile: SourceFile,
  ): void {
    const shape = input.objectShapes.resolveNode(sourceNode, sourceFile);
    if (shape === undefined) {
      issue(pattern.sourceNode, "Object destructuring assignment requires finalized provider object-shape facts before C# emission.");
      return;
    }
    recordSource(pattern.sourceNode, { kind: "object-shape-source", shape });
    const extractedSourceNames = new Set<string>();
    for (const element of pattern.elements) {
      if (element.kind === "object-rest") continue;
      const sourceName = assignmentPropertyName(element)?.sourceName;
      if (sourceName !== undefined) extractedSourceNames.add(sourceName);
    }
    for (const element of pattern.elements) {
      if (element.kind === "object-rest") {
        analyzeObjectAssignmentRest(element, shape, extractedSourceNames, sourceFile);
        continue;
      }
      const property = assignmentPropertyName(element);
      if (property?.sourceName === undefined) {
        if (property !== undefined) issue(property.node, "Object destructuring assignment from object-shape facts supports only identifier or string-literal property names.");
        issue(element.sourceNode, "Object destructuring assignment property must match a finalized provider object-shape member.");
        continue;
      }
      const selected = selectCsharpBindingPatternProjection({ kind: "object-member", shape, sourceName: property.sourceName,
        description: "Object destructuring assignment property" });
      if (selected.kind !== "element" || selected.element.kind !== "object-shape-member") {
        if (selected.kind === "unresolved") for (const reason of selected.reasons) issue(element.sourceNode, reason);
        continue;
      }
      const { member } = selected.element;
      recordElement(element.sourceNode, selected.element);
      if (element.initializer === undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, member.type);
        continue;
      }
      const defaultValue = input.evidence.nodeTargetType.get(element.initializer);
      if (defaultValue !== undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, csharpBindingDefaultCarrier(member.type, defaultValue));
      }
    }
  }

  function assignmentPropertyName(
    element: Extract<CsharpDestructuringAssignmentObjectElement, { readonly kind: "object-property" }>,
  ): { readonly node: Node; readonly sourceName?: string } | undefined {
    const propertyName = element.propertyName ?? (element.target.kind === "node" ? element.target.node : undefined);
    if (propertyName === undefined) return undefined;
    return HasSourceKind(ast, propertyName, KindIdentifier) || HasSourceKind(ast, propertyName, KindStringLiteral)
      ? { node: propertyName, sourceName: Node_Text(ast, propertyName) }
      : { node: propertyName };
  }

  function analyzeObjectAssignmentRest(
    element: Extract<CsharpDestructuringAssignmentObjectElement, { readonly kind: "object-rest" }>,
    sourceShape: CsharpObjectShapeFact,
    extractedSourceNames: ReadonlySet<string>,
    sourceFile: SourceFile,
  ): void {
    if (element.target.kind !== "node" || !HasSourceKind(ast, element.target.node, KindIdentifier)) {
      issue(element.sourceNode, "Object rest destructuring assignment requires an identifier assignment target.");
      return;
    }
    const restContract = input.objectShapes.resolveNode(element.target.node, sourceFile);
    const restShape = restContract === undefined ? undefined : input.objectShapes.resolveCopyShape(restContract);
    if (restShape === undefined) {
      issue(element.sourceNode, "Object rest destructuring assignment requires finalized provider object-shape facts for the rest target.");
      return;
    }
    recordObjectRest(element.sourceNode, restShape, sourceShape, extractedSourceNames, "Object rest destructuring assignment");
  }

  function analyzeAssignmentTarget(
    target: CsharpDestructuringAssignmentTarget,
    projectionNode: Node,
    sourceFile: SourceFile,
    carrier: TargetTypeRef | undefined,
  ): void {
    if (target.kind === "pattern") {
      analyzeAssignmentPattern(target.pattern, projectionNode, sourceFile, carrier);
    } else if (!HasSourceKind(ast, target.node, KindIdentifier)) {
      issue(target.node, "Destructuring assignment target supports source-owned identifiers and nested destructuring patterns only.");
    }
  }

  function assignmentPattern(node: Node): CsharpDestructuringAssignmentPattern | undefined {
    if (HasSourceKind(ast, node, KindArrayLiteralExpression)) {
      const elements = ast.as.AsArrayLiteralExpression(node)?.Elements?.Nodes ?? [];
      return Object.freeze({
        kind: "array",
        sourceNode: node,
        elements: Object.freeze(elements.map((element) => element === undefined ? undefined : assignmentArrayElement(element))),
      });
    }
    if (HasSourceKind(ast, node, KindObjectLiteralExpression)) {
      const properties = AsObjectLiteralExpression(ast, node)?.Properties?.Nodes ?? [];
      return Object.freeze({
        kind: "object",
        sourceNode: node,
        elements: Object.freeze(properties.flatMap((property) => {
          const element = property === undefined ? undefined : assignmentObjectElement(property);
          return element === undefined ? [] : [element];
        })),
      });
    }
    return undefined;
  }

  function assignmentArrayElement(node: Node): CsharpDestructuringAssignmentArrayElement | undefined {
    if (HasSourceKind(ast, node, KindOmittedExpression)) return undefined;
    if (HasSourceKind(ast, node, KindSpreadElement)) {
      const target = Node_Expression(ast, node) ?? AsSpreadElement(ast, node)?.Expression;
      return target === undefined ? undefined : Object.freeze({ kind: "array-element", sourceNode: node, target: assignmentTarget(target), rest: true });
    }
    const defaulted = assignmentDefaultTarget(node);
    if (defaulted !== undefined) {
      return Object.freeze({ kind: "array-element", sourceNode: node, target: defaulted.target, initializer: defaulted.initializer, rest: false });
    }
    return Object.freeze({ kind: "array-element", sourceNode: node, target: assignmentTarget(node), rest: false });
  }

  function assignmentObjectElement(node: Node): CsharpDestructuringAssignmentObjectElement | undefined {
    if (HasSourceKind(ast, node, KindSpreadAssignment)) {
      const spread = AsSpreadAssignment(ast, node);
      return spread?.Expression === undefined ? undefined : Object.freeze({ kind: "object-rest", sourceNode: node, target: assignmentTarget(spread.Expression) });
    }
    if (HasSourceKind(ast, node, KindShorthandPropertyAssignment)) {
      const shorthand = AsShorthandPropertyAssignment(ast, node);
      const defaultInitializer = shorthand?.ObjectAssignmentInitializer;
      return shorthand?.name === undefined ? undefined : Object.freeze({
        kind: "object-property",
        sourceNode: node,
        target: assignmentTarget(shorthand.name),
        ...(defaultInitializer === undefined ? {} : { initializer: defaultInitializer }),
      });
    }
    if (HasSourceKind(ast, node, KindPropertyAssignment)) {
      const property = AsPropertyAssignment(ast, node);
      const target = property?.Initializer;
      const defaulted = target === undefined ? undefined : assignmentDefaultTarget(target);
      const assignmentTargetValue = defaulted?.target ?? (target === undefined ? undefined : assignmentTarget(target));
      return assignmentTargetValue === undefined ? undefined : Object.freeze({
        kind: "object-property",
        sourceNode: node,
        ...(property?.name === undefined ? {} : { propertyName: property.name }),
        target: assignmentTargetValue,
        ...(defaulted?.initializer === undefined ? {} : { initializer: defaulted.initializer }),
      });
    }
    return undefined;
  }

  function assignmentTarget(node: Node): CsharpDestructuringAssignmentTarget {
    const pattern = assignmentPattern(node);
    return Object.freeze(pattern === undefined ? { kind: "node", node } : { kind: "pattern", pattern });
  }

  function assignmentDefaultTarget(node: Node): { readonly target: CsharpDestructuringAssignmentTarget; readonly initializer: Node } | undefined {
    if (!HasSourceKind(ast, node, KindBinaryExpression)) return undefined;
    const expression = AsBinaryExpression(ast, node);
    if (ast.operatorKindName(node) !== KindEqualsToken || expression?.Left === undefined || expression.Right === undefined) return undefined;
    assignmentDefaults.add(node);
    return { target: assignmentTarget(expression.Left), initializer: expression.Right };
  }
}
