import { createCsharpDestructuringAssignmentAnalysis } from "./destructuring-assignments.js";
import { createCsharpBindingPatternProducer } from "../program/records/binding-patterns.js";
import type { AstReader, Node, SourceFile, Type } from "@tsonic/tsts";
import { csharpNativePropertyNameIssue } from "../objects/computed-field-names.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";
import { getCsharpNullableElementTargetType, isCsharpValueTypeTargetType } from "../../target-model/types/index.js";
import {
  AsBinaryExpression,
  AsBindingElement,
  AsBindingPattern,
  AsForInOrOfStatement,
  AsParameterDeclaration,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindForOfStatement,
  KindIdentifier,
  KindObjectBindingPattern,
  KindStringLiteral,
  KindVariableDeclarationList,
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
  CsharpDestructuringAssignmentPattern,
} from "../../target-model/records/value-projections.js";
import { selectCsharpBindingPatternProjection, selectCsharpDefaultValueContract } from "../../policy/types/objects/binding-projection-policy.js";
import { csharpBindingDefaultCarrier } from "../../target-model/types/binding-normalization.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import {
  isCsharpNeverTargetType,
  isCsharpVoidTargetType,
} from "../../target-model/types/index.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/index.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";

export interface CsharpBindingPatternAnalysisInput {
  readonly ast: AstReader;
  readonly semanticsFor: (node: Node) => SourceFileSemantics;
  readonly sourceFiles: readonly SourceFile[];
  readonly participation: CsharpNativeParticipationInput["participation"];
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
  readonly valueReads: CsharpValueReadClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications;
  readonly typePolicy: Pick<CsharpPolicyContext["types"], "resolveType">;
  readonly conversionPolicy: Parameters<typeof selectCsharpConversion>[0];
  readonly storage: Pick<CsharpStorageClassifications, "storageType">;
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
  const published = createCsharpBindingPatternProducer();
  for (const entry of patterns.entries) {
    if (!required.has(entry.root)) continue;
    requireCsharpRecord(requiredRecords, { family: "bindingPatternProjection", subject: entry.node,
      construct: "consumed native binding pattern", producer: "admitCsharpBindingPatterns" });
    published.admit(entry.node, entry.fact);
  }
  return Object.freeze({
    ...published.seal(),
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
  const checkedPatternTypes = new Map<Node, Type | undefined>();
  const lookup = Object.freeze({ get: (node: Node) => facts.get(node) });
  const candidates: CsharpBindingPatternCandidate[] = [];
  let root: Node | undefined;
  const assignments = createCsharpDestructuringAssignmentAnalysis(input, {
    completesWithValue, admitSource, recordAssignment, draftFor: node => facts.get(node), issue, carrierDetail,
    recordSource, recordElement, recordBinding, bindingPropertySourceName, recordObjectRest,
  });
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
    } else if (ast.is.IsBinaryExpression(node) && !assignments.isDefault(node)) {
      root = node;
      assignments.analyze(node, sourceFile);
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

  function issue(node: Node, message: string, evidence: readonly string[] = [], code = "CSHARP_UNSUPPORTED_AST"): void {
    const patternRoot = root;
    if (patternRoot === undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "A binding-pattern candidate issue was recorded outside its pattern root.", node);
    }
    candidates.push(Object.freeze({ node, root: patternRoot, code, message,
      evidence: Object.freeze([...new Set(evidence)]) }));
  }

  function recordSource(node: Node, source: CsharpBindingPatternSource): void {
    if (root === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A binding projection requires its checked root.", node);
    roots.set(node, root);
    facts.set(node, Object.freeze({ ...facts.get(node), source: Object.freeze(source) }));
  }

  function recordElement(node: Node, element: CsharpBindingElementProjection, initializer?: Node, presence = false): void {
    if (root === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A binding element requires its checked root.", node);
    roots.set(node, root);
    const source = element.kind === "array-element" ? element.elementCarrier
      : element.kind === "object-shape-member" ? element.member.type
      : element.kind === "object-shape-absence" ? element.carrier : undefined;
    const tupleDefault = element.kind === "array-element" ? element.tupleDefault : undefined;
    const initialType = initializer === undefined ? undefined : input.evidence.nodeTargetType.get(initializer);
    const target = tupleDefault?.kind === "planned" ? tupleDefault.carrier
      : source === undefined || initialType === undefined ? undefined : csharpBindingDefaultCarrier(source, initialType);
    const defaultValue = source === undefined || target === undefined || initializer === undefined || tupleDefault?.kind === "unused"
      ? undefined : selectCsharpDefaultValueContract(source, target, presence);
    if (element.kind === "object-shape-member" && initializer !== undefined) {
      const member = element.member;
      if (member.optional === true && getCsharpNullableElementTargetType(member.type) === undefined && isCsharpValueTypeTargetType(member.type)) {
        issue(initializer, `Object-shape member '${member.sourceName}' default requires optional value-type members to carry a nullable target carrier before C# emission.`);
      }
      if (defaultValue !== undefined && csharpTargetTypeRenderingRejection(defaultValue.target) !== undefined) {
        issue(initializer, `Object-shape member '${member.sourceName}' default requires a renderable finalized target carrier before C# emission.`);
      }
    }
    if (element.kind === "array-element") {
      if (element.elementCarrier === undefined || csharpTargetTypeRenderingRejection(element.elementCarrier) !== undefined) {
        issue(node, "Array destructuring element requires a renderable provider element carrier type before C# emission.");
      }
      if (element.tupleDefault?.kind === "planned" &&
        csharpTargetTypeRenderingRejection(element.tupleDefault.carrier) !== undefined) {
        issue(initializer ?? node, "Tuple destructuring defaults require a renderable non-nullish element type and the active expression planner.");
      }
      if (presence && defaultValue !== undefined && csharpTargetTypeRenderingRejection(defaultValue.target) !== undefined) {
        issue(initializer ?? node, "Array default requires a renderable finalized element carrier.");
      }
    } else if (element.kind === "array-rest" && csharpTargetTypeRenderingRejection(element.restCarrier) !== undefined) {
      issue(node, "Array rest destructuring requires a renderable provider array carrier type before C# emission.");
    } else if (element.kind === "tuple-rest" && csharpTargetTypeRenderingRejection(element.restCarrier) !== undefined) {
      issue(node, "Tuple rest destructuring requires a renderable provider tuple carrier type before C# emission.");
    }
    facts.set(node, Object.freeze({ ...facts.get(node), element: Object.freeze(element),
      ...(defaultValue === undefined ? {} : { defaultValue }) }));
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
    recordBinding(elementNode, name, carrier);
    if (isBindingPattern(name)) analyzePattern(name, elementNode, sourceFile, carrier);
  }

  function recordBinding(node: Node, name: Node, source: TargetTypeRef | undefined): void {
    if (source === undefined) return;
    const pattern = isBindingPattern(name) || ast.is.IsArrayLiteralExpression(name) || ast.is.IsObjectLiteralExpression(name);
    const target = pattern ? source : input.storage.storageType.get(name);
    if (target === undefined || csharpTargetTypeRenderingRejection(target) !== undefined) {
      issue(name, "Destructuring binding requires its exact renderable finalized native storage carrier before C# emission.");
      return;
    }
    const selected = selectCsharpConversion(input.conversionPolicy, source, target, "implicit");
    const conversion = admitCsharpConversionSelection(input.conversionPolicy, source, target, selected);
    if (conversion.kind === "rejected") {
      issue(name, conversion.reason);
      return;
    }
    facts.set(node, Object.freeze({ ...facts.get(node), binding: Object.freeze({
      node: name, source, target, conversion: Object.freeze(conversion),
    }) }));
  }

  function recordAssignment(node: Node, pattern: CsharpDestructuringAssignmentPattern): void {
    if (root === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A destructuring assignment requires its checked root.", node);
    roots.set(node, root);
    facts.set(node, Object.freeze({ ...facts.get(node), assignmentPattern: pattern }));
  }

  function analyzePattern(pattern: Node, sourceNode: Node, sourceFile: SourceFile, sourceCarrierOverride: TargetTypeRef | undefined): void {
    if (HasSourceKind(ast, pattern, KindArrayBindingPattern)) {
      analyzeArrayPattern(pattern, sourceNode, sourceFile, sourceCarrierOverride);
    } else if (HasSourceKind(ast, pattern, KindObjectBindingPattern)) {
      analyzeObjectPattern(pattern, sourceNode, sourceFile, sourceCarrierOverride);
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
      recordElement(elementNode, projection.element, element.Initializer, bindingCarrier.kind === "array");
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
        const defaultValue = facts.get(elementNode)?.defaultValue;
        if (defaultValue !== undefined) {
          analyzeNested(name, elementNode, sourceFile, defaultValue.target);
        }
      }
    }
  }

  function analyzeObjectPattern(pattern: Node, sourceNode: Node, sourceFile: SourceFile, sourceCarrier: TargetTypeRef | undefined): void {
    const shape = sourceCarrier === undefined ? input.objectShapes.resolveNode(sourceNode, sourceFile)
      : input.objectShapes.resolveTarget(sourceCarrier);
    const selected = selectCsharpBindingPatternProjection({ kind: "object-source", shape,
      sourceOwned: input.evidence.sourceOwnedProjectShape.get(sourceNode) === true });
    if (selected.kind === "source" && selected.source.kind === "object-shape-source") {
      analyzeObjectShapePattern(pattern, selected.source.shape, sourceFile);
      return;
    }
    if (selected.kind === "source" && selected.source.kind === "source-owned-source") {
      analyzeSourceOwnedPattern(pattern, sourceNode, sourceFile);
      return;
    }
    issue(pattern, "Object destructuring requires an exact source-owned declaration or target object-shape policy.");
  }

  function objectShapePropertyName(elementNode: Node): { readonly node: Node; readonly sourceName?: string; readonly reason?: string } | undefined {
    const element = AsBindingElement(ast, elementNode);
    const propertyName = element?.PropertyName ?? element?.name;
    if (propertyName === undefined) return undefined;
    return { node: propertyName, ...bindingPropertySourceName(propertyName) };
  }

  function bindingPropertySourceName(propertyName: Node): { readonly sourceName?: string; readonly reason?: string } {
    if (ast.is.IsComputedPropertyName(propertyName) || ast.is.IsNumericLiteral(propertyName)) {
      const selected = input.semanticsFor(propertyName).propertyNames.get(propertyName);
      if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "A native binding property requires its completed checked property-name selection.", propertyName);
      if (selected.kind === "resolved") return { sourceName: selected.name };
      const issue = csharpNativePropertyNameIssue(propertyName, selected);
      return issue === undefined ? {} : { reason: issue.message };
    }
    return HasSourceKind(ast, propertyName, KindIdentifier) || HasSourceKind(ast, propertyName, KindStringLiteral)
      ? { sourceName: Node_Text(ast, propertyName) } : {};
  }

  function analyzeObjectShapePattern(pattern: Node, shape: CsharpObjectShapeFact, sourceFile: SourceFile): void {
    recordSource(pattern, { kind: "object-shape-source", shape });
    const checkedType = checkedPatternType(pattern);
    const checkedMembers = checkedType === undefined ? [] : input.semanticsFor(pattern).types.propertyInfos(checkedType);
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
        if (property?.reason !== undefined) {
          issue(property.node, property.reason);
          continue;
        }
        if (property !== undefined) issue(property.node, "Object destructuring from object-shape facts supports only identifier or string-literal property names.");
        issue(elementNode, "Object destructuring property must match a finalized provider object-shape member.");
        continue;
      }
      const checked = checkedMembers.filter(member => member.name === property.sourceName);
      const selected = selectCsharpBindingPatternProjection({ kind: "object-member", shape, sourceName: property.sourceName,
        description: "Object destructuring property", permitsAbsence: element.Initializer !== undefined ||
          checked.length === 1 && checked[0]!.optional });
      if (selected.kind !== "element" || selected.element.kind !== "object-shape-member" && selected.element.kind !== "object-shape-absence") {
        if (selected.kind === "unresolved") for (const reason of selected.reasons) issue(elementNode, reason);
        continue;
      }
      const carrier = selected.element.kind === "object-shape-member" ? selected.element.member.type : selected.element.carrier;
      recordElement(elementNode, selected.element, element.Initializer);
      if (element.Initializer === undefined) {
        analyzeNested(name, elementNode, sourceFile, carrier);
        continue;
      }
      const defaultValue = facts.get(elementNode)?.defaultValue;
      if (defaultValue !== undefined) {
        analyzeNested(name, elementNode, sourceFile, defaultValue.target);
      }
    }
  }

  function checkedPatternType(pattern: Node): Type | undefined {
    if (checkedPatternTypes.has(pattern)) return checkedPatternTypes.get(pattern);
    const selected = selectCheckedPatternType(pattern);
    checkedPatternTypes.set(pattern, selected);
    return selected;
  }

  function selectCheckedPatternType(pattern: Node): Type | undefined {
    const owner = ast.parent(pattern);
    if (owner === undefined) return undefined;
    const semantics = input.semanticsFor(owner);
    const element = AsBindingElement(ast, owner);
    if (element !== undefined) {
      const parentPattern = ast.parent(owner);
      const parentType = parentPattern === undefined ? undefined : checkedPatternType(parentPattern);
      if (parentPattern === undefined || parentType === undefined) return undefined;
      let selected: Type | undefined;
      if (HasSourceKind(ast, parentPattern, KindObjectBindingPattern)) {
        const name = objectShapePropertyName(owner)?.sourceName;
        const members = name === undefined ? [] : semantics.types.propertyInfos(parentType).filter(member => member.name === name);
        selected = members.length === 1 ? members[0]!.type : undefined;
      } else if (HasSourceKind(ast, parentPattern, KindArrayBindingPattern)) {
        const index = AsBindingPattern(ast, parentPattern)?.Elements?.Nodes.indexOf(owner);
        if (index === undefined || index < 0) return undefined;
        if (semantics.types.isTuple(parentType)) selected = semantics.types.tupleElementInfos(parentType)[index]?.type;
        else {
          const indices = semantics.types.indexInfos(parentType).filter(info => info.keyType !== undefined && semantics.types.isNumberLike(info.keyType));
          selected = indices.length === 1 ? indices[0]!.valueType : undefined;
        }
      }
      return selected === undefined || element.Initializer === undefined ? selected
        : semantics.types.withoutMissingOrUndefined(selected);
    }
    const declaration = AsVariableDeclaration(ast, owner) ?? AsParameterDeclaration(ast, owner);
    if (declaration?.Type !== undefined) return semantics.types.authoredType(declaration.Type);
    const iteration = forOfHeadStatement(owner);
    if (iteration !== undefined) return semantics.operations.iteration(iteration)?.sourceElementType;
    return declaration?.Initializer === undefined ? undefined : semantics.types.expressionType(declaration.Initializer);
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
    recordBinding(elementNode, name, restShape.targetType);
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

  function analyzeSourceOwnedPattern(pattern: Node, sourceNode: Node, sourceFile: SourceFile): void {
    recordSource(pattern, { kind: "source-owned-source" });
    const semantics = input.semanticsFor(sourceNode);
    const sourceType = ast.is.IsParameterDeclaration(sourceNode) || ast.is.IsBindingElement(sourceNode)
      ? semantics.declarations.declaredValueType(sourceNode) : semantics.types.expressionType(sourceNode);
    const members = sourceType === undefined ? [] : semantics.types.propertyInfos(sourceType);
    const elements = AsBindingPattern(ast, pattern)?.Elements?.Nodes ?? [];
    for (const elementNode of elements) {
      const element = elementNode === undefined ? undefined : AsBindingElement(ast, elementNode);
      if (elementNode === undefined || element === undefined) continue;
      const name = element.name;
      if (name === undefined) continue;
      const propertyName = element.PropertyName ?? name;
      const identifier = HasSourceKind(ast, propertyName, KindIdentifier);
      const property = bindingPropertySourceName(propertyName);
      if (property.reason !== undefined) {
        issue(propertyName, property.reason);
        continue;
      }
      const sourceName = property.sourceName;
      const selected = selectCsharpBindingPatternProjection({ kind: "source-owned-member", sourceName, stringLiteral: !identifier,
        rest: element.DotDotDotToken !== undefined, hasDefault: element.Initializer !== undefined });
      if (selected.kind !== "element") {
        if (selected.kind === "unresolved" && selected.reasons.length > 0) {
          for (const reason of selected.reasons) issue(element.DotDotDotToken !== undefined ? elementNode : element.Initializer ?? propertyName, reason);
        } else issue(propertyName, "Object destructuring from source-owned declarations supports only identifier property names until provider object-shape facts supply target member names.");
        continue;
      }
      if (selected.element.kind !== "source-owned-member") failTargetAnalysisInvariant("tsonic-csharp", "A source-owned binding requires its selected native member projection.", elementNode);
      const targetName = tryCsharpIdentifier(selected.element.propertyName);
      if (targetName === undefined) {
        issue(propertyName, `Object destructuring source property '${selected.element.propertyName}' is not a valid C# identifier. Add an explicit target name/fact instead of relying on backend name rewriting.`, [], "CSHARP_INVALID_IDENTIFIER");
        continue;
      }
      recordElement(elementNode, { ...selected.element, propertyName: targetName });
      const member = members.find(candidate => candidate.name === sourceName);
      const carrier = member === undefined ? undefined : input.typePolicy.resolveType(member.type, sourceFile);
      if (carrier === undefined) {
        issue(elementNode, "Object destructuring source property requires its exact finalized native extraction carrier before C# emission.");
        continue;
      }
      analyzeNested(name, elementNode, sourceFile, carrier);
    }
  }

}
