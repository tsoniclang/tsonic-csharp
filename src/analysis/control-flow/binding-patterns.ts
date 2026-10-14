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
  sourceLexicalFunctionIsUnused,
} from "@tsonic/target-api/source";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpObjectShapeClassifications } from "../objects/model.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
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
import { csharpBindingDefaultCarrier } from "../../target-model/types/binding-normalization.js";
import {
  csharpArrayBindingProjectionTarget,
  csharpObjectShapeMemberLookupFailureMessage,
  getCsharpNullableElementTargetType,
  isCsharpNeverTargetType,
  isCsharpVoidTargetType,
  resolveCsharpArrayBindingCarrier,
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberBySourceContract,
  resolveCsharpObjectShapeMemberBySourceKey,
  targetTypeRefEquals,
} from "../../target-model/types/index.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/index.js";
import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";

export interface CsharpBindingPatternAnalysisInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly navigation: Pick<SourceProgramNavigation, "declarationUseSummary">;
  readonly captureClosure: CsharpCaptureStorage["captureClosure"];
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
  readonly valueReads: CsharpValueReadClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications;
}

export interface CsharpPlannedSubtreeInput {
  readonly ast: AstReader;
  readonly navigation: Pick<SourceProgramNavigation, "declarationUseSummary">;
  readonly captureClosure: CsharpCaptureStorage["captureClosure"];
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata">;
  readonly operations: Pick<CsharpTargetOperationClassifications, "nativeUnreachable">;
}

export function isCsharpUnplannedSubtree(input: CsharpPlannedSubtreeInput, node: Node): boolean {
  const { ast } = input;
  return input.evidence.compileTimeMetadata.get(node) || input.operations.nativeUnreachable.get(node) ||
    ast.is.IsModuleDeclaration(node) ||
    (ast.is.IsFunctionDeclaration(node) && ast.body(node) !== undefined && input.captureClosure.get(node) === undefined &&
      sourceLexicalFunctionIsUnused(node, ast, input.navigation));
}

const unprovenCarrierReason =
  "C# runtime representation is not proven by authored source facts, the selected source profile, project declarations, or an exact provider relation.";
const unprovenCarrierEvidence = "C# type policy found no exact runtime representation.";

export function analyzeCsharpBindingPatterns(
  input: CsharpBindingPatternAnalysisInput,
): CsharpBindingPatternClassifications {
  const { ast } = input;
  const facts = new WeakMap<Node, CsharpBindingProjectionFact>();
  const issues: CsharpBindingPatternIssue[] = [];
  const assignmentDefaults = new WeakSet<Node>();
  for (const sourceFile of input.sourceFiles) visit(sourceFile, sourceFile);
  return Object.freeze({
    bindingPatternProjection: Object.freeze({ get: (node: Node) => facts.get(node) }),
    issues: Object.freeze(issues),
  });

  function visit(node: Node, sourceFile: SourceFile): void {
    if (isCsharpUnplannedSubtree(input, node)) return;
    if (ast.is.IsVariableDeclaration(node)) {
      const variable = AsVariableDeclaration(ast, node);
      const name = variable?.name;
      if (name !== undefined && isBindingPattern(name)) {
        if (isForOfHead(node)) {
          analyzePattern(name, node, sourceFile, undefined);
        } else if (variable?.Initializer !== undefined) {
          admitSource(name, variable.Initializer, sourceFile, "Destructuring source expression");
          if (completesWithValue(variable.Initializer)) analyzePattern(name, variable.Initializer, sourceFile, undefined);
        }
      }
    } else if (ast.is.IsParameterDeclaration(node)) {
      const name = AsParameterDeclaration(ast, node)?.name;
      const owner = ast.parent(node);
      if (name !== undefined && isBindingPattern(name) && owner !== undefined && parameterOwnerIsPlanned(owner, sourceFile)) {
        analyzePattern(name, node, sourceFile, undefined);
      }
    } else if (ast.is.IsBinaryExpression(node) && !assignmentDefaults.has(node)) {
      analyzeAssignment(node, sourceFile);
    }
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child, sourceFile); });
  }

  function completesWithValue(source: Node): boolean {
    const carrier = input.valueReads.valueRead.get(source)?.value;
    return !isCsharpNeverTargetType(carrier) && !isCsharpVoidTargetType(carrier);
  }

  function parameterOwnerIsPlanned(owner: Node, sourceFile: SourceFile): boolean {
    if (ast.body(owner) !== undefined) return true;
    if (ast.is.IsMethodDeclaration(owner)) return ast.hasModifierKind(owner, "abstract");
    const declaringInterface = ast.parent(owner);
    const interfaceOwner = declaringInterface === undefined ? undefined : ast.parent(declaringInterface);
    if (!ast.is.IsMethodSignatureDeclaration(owner) || declaringInterface === undefined || !ast.is.IsInterfaceDeclaration(declaringInterface) ||
      interfaceOwner === undefined || !ast.is.IsSourceFile(interfaceOwner)) return false;
    const shape = input.objectShapes.resolveNode(declaringInterface, sourceFile);
    const selected = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape, [owner]);
    return selected?.kind !== "resolved" || selected.member.optional !== true;
  }

  function isBindingPattern(node: Node): boolean {
    return HasSourceKind(ast, node, KindArrayBindingPattern) || HasSourceKind(ast, node, KindObjectBindingPattern);
  }

  function isForOfHead(declaration: Node): boolean {
    const list = ast.parent(declaration);
    const statement = list === undefined ? undefined : ast.parent(list);
    return list !== undefined && statement !== undefined &&
      HasSourceKind(ast, list, KindVariableDeclarationList) &&
      HasSourceKind(ast, statement, KindForOfStatement) &&
      AsForInOrOfStatement(ast, statement)?.Initializer === list;
  }

  function issue(node: Node, message: string, evidence: readonly string[] = []): void {
    issues.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message, evidence: Object.freeze([...new Set(evidence)]) }));
  }

  function recordSource(node: Node, source: CsharpBindingPatternSource): void {
    facts.set(node, Object.freeze({ ...facts.get(node), source: Object.freeze(source) }));
  }

  function recordElement(node: Node, element: CsharpBindingElementProjection): void {
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
    const bindingCarrier = resolveCsharpArrayBindingCarrier(sourceCarrier);
    if (sourceCarrier === undefined || bindingCarrier === undefined) {
      const detail = carrierDetail(sourceNode, "Runtime carrier fact is missing for the array destructuring source expression.");
      issue(pattern, `Array destructuring requires a finalized provider array or tuple runtime-carrier fact for the source expression. ${detail.reason}`, detail.evidence);
      return;
    }
    recordSource(pattern, { kind: "array-source", sourceCarrier, bindingCarrier });
    const elements = AsBindingPattern(ast, pattern)?.Elements?.Nodes ?? [];
    for (const [index, elementNode] of elements.entries()) {
      const element = elementNode === undefined ? undefined : AsBindingElement(ast, elementNode);
      if (elementNode === undefined || element === undefined) continue;
      const name = element.name;
      if (name === undefined) continue;
      if (element.DotDotDotToken !== undefined) {
        if (bindingCarrier.kind === "array") {
          recordElement(elementNode, { kind: "array-rest", start: index, restCarrier: bindingCarrier.restCarrier });
          analyzeNested(name, elementNode, sourceFile, bindingCarrier.restCarrier);
          continue;
        }
        const restCarrier = csharpArrayBindingProjectionTarget(bindingCarrier, index, true);
        if (restCarrier?.kind !== "tuple") {
          failTargetAnalysisInvariant("tsonic-csharp", "Tuple rest destructuring requires an exact tuple-slice carrier.", elementNode);
        }
        recordElement(elementNode, { kind: "tuple-rest", start: index, restCarrier });
        analyzeNested(name, elementNode, sourceFile, restCarrier);
        continue;
      }
      const elementCarrier = csharpArrayBindingProjectionTarget(bindingCarrier, index, false);
      recordElement(elementNode, elementCarrier === undefined
        ? { kind: "array-element", index }
        : { kind: "array-element", index, elementCarrier });
      if (elementCarrier === undefined) continue;
      if (element.Initializer === undefined) {
        analyzeNested(name, elementNode, sourceFile, elementCarrier);
      } else if (bindingCarrier.kind !== "array") {
        analyzeNested(name, elementNode, sourceFile, getCsharpNullableElementTargetType(elementCarrier) ?? elementCarrier);
      } else {
        const defaultValue = input.evidence.nodeTargetType.get(element.Initializer);
        if (defaultValue !== undefined) {
          analyzeNested(name, elementNode, sourceFile, csharpBindingDefaultCarrier(bindingCarrier.element, defaultValue));
        }
      }
    }
  }

  function analyzeObjectPattern(pattern: Node, sourceNode: Node, sourceFile: SourceFile): void {
    const shape = input.objectShapes.resolveNode(sourceNode, sourceFile);
    if (shape !== undefined) {
      analyzeObjectShapePattern(pattern, shape, sourceFile);
      return;
    }
    if (input.evidence.sourceOwnedProjectShape.get(sourceNode) === true) {
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
      const lookup = resolveCsharpObjectShapeMemberBySourceContract(shape, property.sourceName, "checked-object-binding-property");
      if (lookup.kind !== "resolved") {
        issue(elementNode, csharpObjectShapeMemberLookupFailureMessage(lookup, "Object destructuring property"));
        continue;
      }
      recordElement(elementNode, { kind: "object-shape-member", member: lookup.member });
      if (element.Initializer === undefined) {
        analyzeNested(name, elementNode, sourceFile, lookup.member.type);
        continue;
      }
      const defaultValue = input.evidence.nodeTargetType.get(element.Initializer);
      if (defaultValue !== undefined) {
        analyzeNested(name, elementNode, sourceFile, csharpBindingDefaultCarrier(lookup.member.type, defaultValue));
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
    for (const sourceName of extractedSourceNames) {
      const stale = resolveCsharpObjectShapeMemberBySourceContract(restShape, sourceName, "finalized-object-rest-member");
      if (stale.kind === "resolved") {
        issue(elementNode, `${description} rest shape must exclude explicitly extracted member '${stale.member.sourceName}'.`);
        return;
      }
    }
    const members: { readonly rest: CsharpObjectShapeMemberFact; readonly source: CsharpObjectShapeMemberFact }[] = [];
    let admitted = true;
    for (const restMember of restShape.members) {
      const sourceLookup = resolveCsharpObjectShapeMemberBySourceKey(sourceShape, restMember.sourceKey, "finalized-object-rest-member");
      if (sourceLookup.kind !== "resolved") {
        issue(elementNode, csharpObjectShapeMemberLookupFailureMessage(sourceLookup, `${description} source shape`));
        admitted = false;
        continue;
      }
      if (!targetTypeRefEquals(sourceLookup.member.type, restMember.type)) {
        issue(elementNode, `${description} member '${restMember.sourceName}' requires matching finalized source and rest member carriers.`);
        admitted = false;
        continue;
      }
      members.push(Object.freeze({ rest: restMember, source: sourceLookup.member }));
    }
    if (admitted) recordElement(elementNode, { kind: "object-shape-rest", restShape, members: Object.freeze(members) });
  }

  function analyzeSourceOwnedPattern(pattern: Node, sourceFile: SourceFile): void {
    recordSource(pattern, { kind: "source-owned-source" });
    const elements = AsBindingPattern(ast, pattern)?.Elements?.Nodes ?? [];
    for (const elementNode of elements) {
      const element = elementNode === undefined ? undefined : AsBindingElement(ast, elementNode);
      if (elementNode === undefined || element === undefined) continue;
      if (element.DotDotDotToken !== undefined) {
        issue(elementNode, "Object rest destructuring requires finalized provider object-spread semantics before C# emission.");
        continue;
      }
      if (element.Initializer !== undefined) {
        issue(element.Initializer, "Destructuring defaults require finalized undefined/default-value semantics before C# emission.");
        continue;
      }
      const name = element.name;
      if (name === undefined) continue;
      const propertyName = element.PropertyName ?? name;
      if (HasSourceKind(ast, propertyName, KindIdentifier)) {
        recordElement(elementNode, { kind: "source-owned-member", propertyName: Node_Text(ast, propertyName) ?? "", propertyNameKind: "identifier" });
      } else {
        const text = HasSourceKind(ast, propertyName, KindStringLiteral)
          ? Node_Text(ast, AsStringLiteral(ast, propertyName))
          : undefined;
        if (text === undefined || tryCsharpIdentifier(text) !== text) {
          issue(propertyName, "Object destructuring from source-owned declarations supports only identifier property names until provider object-shape facts supply target member names.");
          continue;
        }
        recordElement(elementNode, { kind: "source-owned-member", propertyName: text, propertyNameKind: "string-literal" });
      }
      analyzeNested(name, elementNode, sourceFile, undefined);
    }
  }

  function analyzeAssignment(node: Node, sourceFile: SourceFile): void {
    const selected = input.operations.binaryOperation.get(node)?.destructuring;
    if (selected?.kind !== "resolved") return;
    const pattern = assignmentPattern(selected.pattern);
    if (pattern === undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "Destructuring assignment target is outside the current C# planning surface.", selected.pattern);
    }
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
    const bindingCarrier = resolveCsharpArrayBindingCarrier(sourceCarrier);
    if (sourceCarrier === undefined || bindingCarrier === undefined) {
      const detail = carrierDetail(sourceNode, "Runtime carrier fact is missing for the array destructuring assignment source expression.");
      issue(pattern.sourceNode, `Array destructuring assignment requires a finalized provider array or tuple runtime-carrier fact for the source expression. ${detail.reason}`, detail.evidence);
      return;
    }
    recordSource(pattern.sourceNode, { kind: "array-source", sourceCarrier, bindingCarrier });
    for (const [index, element] of pattern.elements.entries()) {
      if (element === undefined) continue;
      if (element.rest) {
        if (bindingCarrier.kind === "array") {
          recordElement(element.sourceNode, { kind: "array-rest", start: index, restCarrier: bindingCarrier.restCarrier });
          analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, bindingCarrier.restCarrier);
          continue;
        }
        const restCarrier = csharpArrayBindingProjectionTarget(bindingCarrier, index, true);
        if (restCarrier?.kind !== "tuple") {
          failTargetAnalysisInvariant("tsonic-csharp", "Tuple rest destructuring assignment requires an exact tuple-slice carrier.", element.sourceNode);
        }
        recordElement(element.sourceNode, { kind: "tuple-rest", start: index, restCarrier });
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, restCarrier);
        continue;
      }
      const elementCarrier = csharpArrayBindingProjectionTarget(bindingCarrier, index, false);
      recordElement(element.sourceNode, elementCarrier === undefined
        ? { kind: "array-element", index }
        : { kind: "array-element", index, elementCarrier });
      if (elementCarrier === undefined) continue;
      if (element.initializer === undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, elementCarrier);
      } else if (bindingCarrier.kind !== "array") {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, getCsharpNullableElementTargetType(elementCarrier) ?? elementCarrier);
      } else {
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
      const lookup = resolveCsharpObjectShapeMemberBySourceContract(shape, property.sourceName, "checked-object-binding-property");
      if (lookup.kind !== "resolved") {
        issue(element.sourceNode, csharpObjectShapeMemberLookupFailureMessage(lookup, "Object destructuring assignment property"));
        continue;
      }
      recordElement(element.sourceNode, { kind: "object-shape-member", member: lookup.member });
      if (element.initializer === undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, lookup.member.type);
        continue;
      }
      const defaultValue = input.evidence.nodeTargetType.get(element.initializer);
      if (defaultValue !== undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, csharpBindingDefaultCarrier(lookup.member.type, defaultValue));
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
      const elements = (node as { readonly Elements?: { readonly Nodes?: readonly (Node | undefined)[] } }).Elements?.Nodes ?? [];
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
