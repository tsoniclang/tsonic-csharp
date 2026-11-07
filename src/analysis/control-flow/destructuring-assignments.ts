import type { Node, SourceFile } from "@tsonic/tsts";
import { AsBinaryExpression, AsObjectLiteralExpression, AsPropertyAssignment, AsShorthandPropertyAssignment, AsSpreadAssignment, AsSpreadElement, HasSourceKind, KindArrayLiteralExpression, KindBinaryExpression, KindEqualsToken, KindIdentifier, KindObjectLiteralExpression, KindOmittedExpression, KindPropertyAssignment, KindShorthandPropertyAssignment, KindSpreadAssignment, KindSpreadElement, Node_Expression, sourceTypeDescriptorStructure, sourceTypeDescriptorTupleValue, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { selectCsharpBindingPatternProjection } from "../../policy/types/objects/binding-projection.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/index.js";
import type { CsharpBindingElementProjection, CsharpBindingPatternSource, CsharpBindingProjectionFact,
  CsharpDestructuringAssignmentArrayElement, CsharpDestructuringAssignmentObjectElement,
  CsharpDestructuringAssignmentPattern, CsharpDestructuringAssignmentTarget } from "../../target-model/records/objects/value-projections.js";
import type { CsharpBindingPatternAnalysisInput } from "./binding-patterns.js";
import { resolveCsharpPublishedNativePropertyRead } from "../objects/native-property-reads.js";

interface PublishedAssignmentSource {
  readonly type: SourceTypeDescriptor;
  readonly tupleOffset?: number;
}

export function createCsharpDestructuringAssignmentAnalysis(input: CsharpBindingPatternAnalysisInput, callbacks: {
  readonly completesWithValue: (source: Node) => boolean;
  readonly admitSource: (node: Node, source: Node, file: SourceFile, description: string) => void;
  readonly recordAssignment: (node: Node, pattern: CsharpDestructuringAssignmentPattern) => void;
  readonly draftFor: (node: Node) => CsharpBindingProjectionFact | undefined;
  readonly issue: (node: Node, message: string, evidence?: readonly string[], code?: string) => void;
  readonly carrierDetail: (source: Node, reason: string) => { readonly reason: string; readonly evidence: readonly string[] };
  readonly recordSource: (node: Node, source: CsharpBindingPatternSource) => void;
  readonly recordElement: (node: Node, element: CsharpBindingElementProjection, initializer?: Node, presence?: boolean) => void;
  readonly recordBinding: (node: Node, name: Node, source: TargetTypeRef | undefined) => void;
  readonly bindingPropertySourceName: (node: Node) => { readonly sourceName?: string; readonly reason?: string };
  readonly recordObjectRest: (node: Node, rest: CsharpObjectShapeFact, source: CsharpObjectShapeFact,
    extracted: ReadonlySet<string>, description: string) => void;
}) {
  const { ast } = input;
  const { completesWithValue, admitSource, recordAssignment, draftFor, issue, carrierDetail, recordSource,
    recordElement, recordBinding, bindingPropertySourceName, recordObjectRest } = callbacks;
  const assignmentDefaults = new WeakSet<Node>();
  return Object.freeze({ analyze: analyzeAssignment, isDefault: (node: Node) => assignmentDefaults.has(node) });

  function analyzeAssignment(node: Node, sourceFile: SourceFile): void {
    const selected = input.operations.binaryOperation.get(node)?.destructuring;
    if (selected?.kind !== "resolved") return;
    const pattern = assignmentPattern(selected.pattern);
    if (pattern === undefined) {
      issue(selected.pattern, "Destructuring assignment target is outside the current C# planning surface.");
      return;
    }
    recordAssignment(node, pattern);
    if (!completesWithValue(selected.source)) return;
    admitSource(selected.pattern, selected.source, sourceFile, "Destructuring assignment source");
    const outcome = input.facts.values.type(selected.source);
    const published = outcome === undefined || outcome.kind === "refused" ? undefined : outcome.type;
    analyzeAssignmentPattern(pattern, selected.source, sourceFile, input.valueReads.valueRead.get(selected.source)?.value,
      published === undefined ? undefined : { type: published });
  }

  function analyzeAssignmentPattern(
    pattern: CsharpDestructuringAssignmentPattern,
    sourceNode: Node,
    sourceFile: SourceFile,
    sourceCarrier: TargetTypeRef | undefined,
    published: PublishedAssignmentSource | undefined,
  ): void {
    recordAssignment(pattern.sourceNode, pattern);
    if (pattern.kind === "array") {
      analyzeArrayAssignmentPattern(pattern, sourceNode, sourceFile, sourceCarrier, published);
    } else {
      analyzeObjectAssignmentPattern(pattern, sourceNode, sourceFile, sourceCarrier, published);
    }
  }

  function analyzeArrayAssignmentPattern(
    pattern: Extract<CsharpDestructuringAssignmentPattern, { readonly kind: "array" }>,
    sourceNode: Node,
    sourceFile: SourceFile,
    sourceCarrier: TargetTypeRef | undefined,
    published: PublishedAssignmentSource | undefined,
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
      recordElement(element.sourceNode, projection.element, element.initializer, bindingCarrier.kind === "array");
      const child = arrayAssignmentSource(published, index, element.rest);
      if (projection.element.kind === "array-rest" || projection.element.kind === "tuple-rest") {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, projection.element.restCarrier, child);
        continue;
      }
      if (projection.element.kind !== "array-element") continue;
      const { elementCarrier, tupleDefault } = projection.element;
      if (elementCarrier === undefined) continue;
      if (element.initializer === undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, elementCarrier, child);
      } else if (tupleDefault !== undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile,
          tupleDefault.kind === "planned" ? tupleDefault.carrier : elementCarrier,
          tupleDefault.kind === "unused" ? child : presentAssignmentSource(child));
      } else if (bindingCarrier.kind === "array") {
        const defaultValue = draftFor(element.sourceNode)?.defaultValue;
        if (defaultValue !== undefined) {
          analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, defaultValue.target,
            presentAssignmentSource(child));
        }
      }
    }
  }

  function arrayAssignmentSource(
    source: PublishedAssignmentSource | undefined,
    index: number,
    rest: boolean,
  ): PublishedAssignmentSource | undefined {
    if (source === undefined) return undefined;
    const structure = sourceTypeDescriptorStructure(source.type);
    if (structure.kind === "tuple") {
      const offset = (source.tupleOffset ?? 0) + index;
      if (rest) return { type: source.type, tupleOffset: offset };
      const type = sourceTypeDescriptorTupleValue(structure, offset);
      return type === undefined ? undefined : { type };
    }
    if (rest) return source;
    const type = structure.kind === "array" ? structure.element : undefined;
    return type === undefined ? undefined : { type };
  }

  function presentAssignmentSource(source: PublishedAssignmentSource | undefined): PublishedAssignmentSource | undefined {
    if (source === undefined) return undefined;
    const structure = sourceTypeDescriptorStructure(source.type);
    const type = structure.kind === "optional" ? structure.value : source.type;
    return { type,
      ...(source.tupleOffset === undefined ? {} : { tupleOffset: source.tupleOffset }) };
  }

  function analyzeObjectAssignmentPattern(
    pattern: Extract<CsharpDestructuringAssignmentPattern, { readonly kind: "object" }>,
    sourceNode: Node,
    sourceFile: SourceFile,
    sourceCarrier: TargetTypeRef | undefined,
    published: PublishedAssignmentSource | undefined,
  ): void {
    const shape = sourceCarrier === undefined ? input.objectShapes.resolveNode(sourceNode)
      : input.objectShapes.resolveTarget(sourceCarrier);
    const nativeProperties = new Map<Node, ReturnType<typeof resolveCsharpPublishedNativePropertyRead>>();
    for (const element of pattern.elements) {
      if (element.kind !== "object-property") continue;
      const sourceName = assignmentPropertyName(element)?.sourceName;
      if (sourceName === undefined) continue;
      nativeProperties.set(element.sourceNode, resolveCsharpPublishedNativePropertyRead(published?.type, sourceName,
        sourceCarrier, { ...input.conversionPolicy, ast, facts: input.facts, sourceFacts: input.sourceFacts }));
    }
    if (shape === undefined && ![...nativeProperties.values()].some(property => property.kind === "resolved")) {
      issue(pattern.sourceNode, "Object destructuring assignment requires finalized provider object-shape facts before C# emission.");
      return;
    }
    if (shape !== undefined) recordSource(pattern.sourceNode, { kind: "object-shape-source", shape });
    else {
      const selected = selectCsharpBindingPatternProjection({ kind: "native-source", carrier: sourceCarrier });
      if (selected.kind !== "source") {
        issue(pattern.sourceNode, "Native destructuring assignment requires its exact renderable receiver carrier.");
        return;
      }
      recordSource(pattern.sourceNode, selected.source);
    }
    const extractedSourceNames = new Set<string>();
    for (const element of pattern.elements) {
      if (element.kind === "object-rest") continue;
      const sourceName = assignmentPropertyName(element)?.sourceName;
      if (sourceName !== undefined) extractedSourceNames.add(sourceName);
    }
    for (const element of pattern.elements) {
      if (element.kind === "object-rest") {
        if (shape === undefined) issue(element.sourceNode, "Object rest destructuring assignment requires finalized provider object-shape facts before C# emission.");
        else analyzeObjectAssignmentRest(element, shape, extractedSourceNames, sourceFile);
        continue;
      }
      const property = assignmentPropertyName(element);
      if (property?.sourceName === undefined) {
        if (property?.reason !== undefined) {
          issue(property.node, property.reason);
          continue;
        }
        if (property !== undefined) issue(property.node, "Object destructuring assignment from object-shape facts supports only identifier or string-literal property names.");
        issue(element.sourceNode, "Object destructuring assignment property must match a finalized provider object-shape member.");
        continue;
      }
      const native = nativeProperties.get(element.sourceNode);
      if (native?.kind === "unresolved") {
        issue(element.sourceNode, "Native destructuring assignment property requires its exact admitted native read projection.");
        continue;
      }
      const selected = native?.kind === "resolved" ? { kind: "element" as const,
        element: { kind: "native-member" as const, property: native.property } }
        : shape === undefined ? undefined : selectCsharpBindingPatternProjection({ kind: "object-member", shape,
          sourceName: property.sourceName, description: "Object destructuring assignment property", permitsAbsence: false });
      if (selected === undefined) {
        issue(element.sourceNode, "Object destructuring assignment property requires finalized provider object-shape facts before C# emission.");
        continue;
      }
      if (selected.kind !== "element") {
        if (selected.kind === "unresolved") for (const reason of selected.reasons) issue(element.sourceNode, reason);
        continue;
      }
      if (selected.element.kind !== "object-shape-member" && selected.element.kind !== "object-shape-absence" &&
          selected.element.kind !== "native-member") continue;
      const carrier = selected.element.kind === "object-shape-member" ? selected.element.member.type
        : selected.element.kind === "native-member" ? selected.element.property.member.returnType : selected.element.carrier;
      const child = native !== undefined && native.sourceType !== undefined
        ? { type: native.sourceType } : undefined;
      recordElement(element.sourceNode, selected.element, element.initializer);
      if (element.initializer === undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, carrier, child);
        continue;
      }
      const defaultValue = draftFor(element.sourceNode)?.defaultValue;
      if (defaultValue !== undefined) {
        analyzeAssignmentTarget(element.target, element.sourceNode, sourceFile, defaultValue.target,
          presentAssignmentSource(child));
      }
    }
  }

  function assignmentPropertyName(
    element: Extract<CsharpDestructuringAssignmentObjectElement, { readonly kind: "object-property" }>,
  ): { readonly node: Node; readonly sourceName?: string; readonly reason?: string } | undefined {
    const propertyName = element.propertyName ?? (element.target.kind === "node" ? element.target.node : undefined);
    if (propertyName === undefined) return undefined;
    return { node: propertyName, ...bindingPropertySourceName(propertyName) };
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
    const restContract = input.objectShapes.resolveNode(element.target.node);
    const restShape = restContract === undefined ? undefined : input.objectShapes.resolveCopyShape(restContract);
    if (restShape === undefined) {
      issue(element.sourceNode, "Object rest destructuring assignment requires finalized provider object-shape facts for the rest target.");
      return;
    }
    recordObjectRest(element.sourceNode, restShape, sourceShape, extractedSourceNames, "Object rest destructuring assignment");
    recordBinding(element.sourceNode, element.target.node, restShape.targetType);
  }

  function analyzeAssignmentTarget(
    target: CsharpDestructuringAssignmentTarget,
    projectionNode: Node,
    sourceFile: SourceFile,
    carrier: TargetTypeRef | undefined,
    published: PublishedAssignmentSource | undefined,
  ): void {
    if (target.kind === "pattern") {
      recordBinding(projectionNode, target.pattern.sourceNode, carrier);
      analyzeAssignmentPattern(target.pattern, projectionNode, sourceFile, carrier, published);
    } else if (!HasSourceKind(ast, target.node, KindIdentifier)) {
      issue(target.node, "Destructuring assignment target supports source-owned identifiers and nested destructuring patterns only.");
    } else {
      recordBinding(projectionNode, target.node, carrier);
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
