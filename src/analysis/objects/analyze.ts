import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type {
  CsharpObjectLiteralTargetShapeResolution,
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpObjectShapeContractKey,
  csharpObjectShapesEqual,
  isCsharpJsValueTargetType,
  targetTypeRefKey,
  targetTypeRefEquals,
  getCsharpRuntimeUnionArms,
} from "../../policy/types/index.js";
import { selectCsharpObjectLiteralUnionCarrier, csharpObjectLiteralDestinationDeclarations } from "../../policy/types/objects/object-shape-policy/union-construction.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpObjectShapeAnalysis, CsharpObjectShapeClassifications } from "./model.js";
import { selectCsharpStructuralInterface, type CsharpStructuralInterfaceRegistration } from "./structural-interfaces.js";
import { mergeCsharpObjectShapeSubjects } from "../../policy/types/objects/object-shape-policy/construction.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import type { CsharpStructuralInterfaceImplementation, CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeMemberTargetTypeParameters, substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { createCsharpObjectShapePropertyOrderIndex } from "./property-order.js";
import { instantiateCsharpObjectShape } from "../../policy/types/objects/object-shape-policy/instantiation.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";

const noExpectedShape = "<none>";
const maximumObjectShapeClassifications = 131_072;
const noStructuralImplementations: readonly CsharpStructuralInterfaceImplementation[] = Object.freeze([]);

export function analyzeCsharpObjectShapes(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
): CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration & { seal(): CsharpObjectShapeAnalysis } {
  const byNode = new Map<Node, CsharpObjectShapeFact>();
  const byTarget = new Map<string, CsharpObjectShapeFact>();
  const templates = new Map<string, CsharpObjectShapeFact>();
  const completedShapes = new WeakMap<CsharpObjectShapeFact, CsharpObjectShapeFact>();
  const copies = new Map<string, CsharpObjectShapeFact>();
  const physicalTypes: TargetTypeRef[] = [];
  const pendingPhysicalTypes = new Map<string, TargetTypeRef>();
  const preparedPhysicalTypes = new Set<string>();
  const objectLiterals = new Map<Node, SourceFile>();
  const copiedMethodImplementations = new Set<string>();
  const operationTypes: TargetTypeRef[] = [];
  const admittedShapes = new Set<CsharpObjectShapeFact>();
  const propertyOrders = createCsharpObjectShapePropertyOrderIndex(policy.ast, reserveClassification);
  let classificationCount = 0;
  let sealed = false;
  let knownShapes: readonly CsharpObjectShapeFact[] = Object.freeze([]);
  const structuralInterfaces = new Map<string, Map<string, {
    readonly selected: CsharpStructuralInterfaceImplementation;
    readonly source: TargetTypeRef;
    readonly destination: TargetTypeRef;
    readonly sourceType?: Type;
  }>>();
  let structuralRevision = 0;
  let closedStructuralRevision = 0;
  const declaredStructuralIssues: CsharpProjectTypeIssue[] = [];
  let structuralIssues: readonly CsharpProjectTypeIssue[] = Object.freeze([]);
  const sealedStructuralImplementations = new Map<string, readonly CsharpStructuralInterfaceImplementation[]>();
  const instantiatedShapes = new Map<string, CsharpObjectShapeFact>();
  const structuralImplementations = (type: TargetTypeRef): readonly CsharpStructuralInterfaceImplementation[] => {
    if (sealed) return sealedStructuralImplementation(type);
    if (type.kind !== "target-named") return [];
    return [...structuralInterfaces.get(type.id)?.values() ?? []].map(({ selected }) => {
      const parameters = new Set(selected.sourceType.kind === "target-named"
        ? (selected.sourceType.typeArguments ?? []).flatMap(argument => argument.kind === "type-parameter" ? [argument.identity] : []) : []);
      const bindings = inferCsharpTargetTypeParameterBindings(selected.sourceType, type, parameters);
      if (bindings === undefined) throw new Error("A structural implementation lost its exact source generic instantiation.");
      return Object.freeze({ ...selected, sourceType: type, interfaceType: substituteTargetTypeParameters(selected.interfaceType, bindings),
        properties: Object.freeze(selected.properties.map(property => Object.freeze({ ...property,
          sourceType: substituteTargetTypeParameters(property.sourceType, bindings),
          member: substituteObjectShapeMemberTargetTypeParameters(property.member, bindings),
        }))),
        methods: Object.freeze(selected.methods.map(method => Object.freeze({ ...method,
          member: substituteObjectShapeMemberTargetTypeParameters(method.member, bindings),
        }))),
      });
    });
  };
  const withInterfaces = (shape: CsharpObjectShapeFact | undefined): CsharpObjectShapeFact | undefined => {
    if (shape === undefined) return undefined;
    const interfaces = new Map((shape.implements ?? []).map(type => [targetTypeRefKey(type), type]));
    for (const selected of structuralImplementations(shape.targetType)) interfaces.set(targetTypeRefKey(selected.interfaceType), selected.interfaceType);
    const declarationTemplate = withInterfaces(shape.declarationTemplate);
    return interfaces.size === 0 && declarationTemplate === shape.declarationTemplate ? shape
      : { ...shape, ...(interfaces.size === 0 ? {} : { implements: Object.freeze([...interfaces.values()]) }),
        ...(declarationTemplate === undefined ? {} : { declarationTemplate }) };
  };

  const rememberShape = (shape: CsharpObjectShapeFact | undefined): void => {
    if (
      shape === undefined ||
      isCsharpJsValueTargetType(shape.targetType) ||
      shape.targetType.kind === "type-parameter"
    ) {
      return;
    }
    const key = targetTypeRefKey(shape.targetType);
    const previous = byTarget.get(key);
    if (previous !== undefined && !csharpObjectShapesEqual(previous, shape)) {
      throw new Error(
        `C# target object shape '${key}' has contradictory analysis classifications.`,
      );
    }
    if (previous === undefined) {
      reserveClassification();
      byTarget.set(key, shape);
    } else {
      const merged = mergeCsharpObjectShapeSubjects(previous, shape);
      byTarget.set(key, merged);
    }
    enqueuePhysicalType(shape.targetType);
    if (shape.declarationTemplate !== undefined) rememberShape(shape.declarationTemplate);
  };

  const rememberTargetShape = (
    type: TargetTypeRef | undefined,
    shape: CsharpObjectShapeFact | undefined,
  ): void => {
    rememberShape(shape);
    if (
      type === undefined ||
      shape === undefined ||
      isCsharpJsValueTargetType(shape.targetType) ||
      shape.targetType.kind === "type-parameter"
    ) {
      return;
    }
    const key = targetTypeRefKey(type);
    const previous = byTarget.get(key);
    if (previous !== undefined && !csharpObjectShapesEqual(previous, shape)) {
      throw new Error(
        `C# target object-shape relation '${key}' has contradictory analysis classifications.`,
      );
    }
    if (previous === undefined) {
      reserveClassification();
      byTarget.set(key, shape);
    } else {
      const merged = mergeCsharpObjectShapeSubjects(previous, shape);
      byTarget.set(key, merged);
    }
    enqueuePhysicalType(type);
  };

  function enqueuePhysicalType(type: TargetTypeRef): void {
    const key = targetTypeRefKey(type);
    if (!preparedPhysicalTypes.has(key)) pendingPhysicalTypes.set(key, type);
  }

  function preparePhysicalShapes(): void {
    const visited = new Set<string>();
    for (const [key, type] of pendingPhysicalTypes) {
      pendingPhysicalTypes.delete(key);
      if (visited.has(key) || preparedPhysicalTypes.has(key)) continue;
      visited.add(key);
      reserveClassification();
      physicalTypes.push(type);
      const shape = byTarget.get(key) ?? policy.objectShapes.resolveTarget(type);
      rememberShape(shape);
      if (shape !== undefined) {
        if (shape.declarationTemplate !== undefined) enqueuePhysicalType(shape.declarationTemplate.targetType);
        const copy = policy.objectShapes.resolveCopyShape(shape);
        if (copy !== undefined) {
          copies.set(key, copy);
          admittedShapes.add(copy);
          preparedPhysicalTypes.add(key);
          if (copy !== shape) rememberShape(copy);
        }
      }
      for (const component of csharpTargetTypeComponents(type, shape)) enqueuePhysicalType(component);
      if (type.kind === "target-named" &&
        (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "class") {
        const definition = policy.projectTypes.catalog.definitionForTarget(type);
        for (const inherited of policy.projectTypes.directSupertypes(type) ?? []) {
          enqueuePhysicalType(inherited);
          if (definition?.kind !== "class" || shape?.sourceType === undefined ||
            policy.projectTypes.catalog.definitionForTarget(inherited)?.kind !== "interface") continue;
          if (!classifications.registerStructuralInterface(definition.declaration, type, inherited, shape.sourceType)) {
            declaredStructuralIssues.push(Object.freeze({ node: definition.declaration, code: "CSHARP_UNSUPPORTED_AST",
              message: "An analyzed interface has no exact inherited native implementation." }));
          }
        }
      }
    }
  }

  function closeStructuralShapes(): void {
    do {
      preparePhysicalShapes();
      closeInheritedStructuralInterfaces();
    } while (pendingPhysicalTypes.size > 0);
  }

  function closeInheritedStructuralInterfaces(): void {
    if (structuralRevision === closedStructuralRevision) return;
    const issues: CsharpProjectTypeIssue[] = [];
    const rejected = new Set<string>();
    for (const implementations of structuralInterfaces.values()) {
      for (const request of implementations.values()) {
        const provided = new Set(structuralImplementations(request.source).map(selected => targetTypeRefKey(selected.interfaceType)));
        const pending = [request.destination];
        const visited = new Set<string>();
        for (let index = 0; index < pending.length; index += 1) {
          const type = pending[index]!;
          const key = targetTypeRefKey(type);
          if (visited.has(key)) continue;
          visited.add(key);
          const shape = withInterfaces(byTarget.get(key) ?? policy.objectShapes.resolveTarget(type));
          const inherited = [...shape?.implements ?? [], ...policy.projectTypes.directSupertypes(type) ?? []];
          for (const base of inherited) {
            const baseKey = targetTypeRefKey(base);
            pending.push(base);
            if (provided.has(baseKey)) continue;
            const baseShape = byTarget.get(baseKey) ?? policy.objectShapes.resolveTarget(base);
            const checkedMethodProtocol = baseShape?.sourceType === undefined &&
              structuralImplementations(request.source).some(implementation => implementation.methods.some(method =>
                method.member.methodValueContract !== undefined && targetTypeRefEquals(method.member.methodValueContract, base)));
            if (checkedMethodProtocol) continue;
            const requestKey = JSON.stringify([targetTypeRefKey(request.source), baseKey]);
            if (rejected.has(requestKey)) continue;
            if (!classifications.registerStructuralInterface(request.selected.sourceNode, request.source, base, request.sourceType)) {
              rejected.add(requestKey);
              issues.push(Object.freeze({ node: request.selected.sourceNode, code: "CSHARP_UNSUPPORTED_AST",
                message: "An analyzed interface has no exact inherited native implementation." }));
            } else provided.add(baseKey);
          }
        }
      }
    }
    structuralIssues = Object.freeze(issues);
    closedStructuralRevision = structuralRevision;
  }

  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile, sourceFile);
  }
  for (const type of evidence.targetTypes) {
    rememberTargetShape(type, policy.objectShapes.resolveTarget(type));
  }
  const visitedOperationTypes = new Set<string>();
  for (let index = 0; index < operationTypes.length; index += 1) {
    const type = operationTypes[index]!;
    const key = targetTypeRefKey(type);
    if (visitedOperationTypes.has(key)) continue;
    visitedOperationTypes.add(key);
    reserveClassification();
    const shape = policy.objectShapes.resolveTarget(type);
    rememberTargetShape(type, shape);
    operationTypes.push(...csharpTargetTypeComponents(type, shape));
  }

  const literalResults = new WeakMap<
    Node,
    Map<string, CsharpObjectLiteralTargetShapeResolution>
  >();
  const literalUnionCarriers = new WeakMap<Node, ReadonlyMap<string, TargetTypeRef>>();
  const unionTypes = evidence.targetTypes.filter(type =>
    getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(type) ?? type, policy.typeDefinitions) !== undefined);
  for (const [literal, sourceFile] of objectLiterals) {
    const unionCarriers = new Map<string, TargetTypeRef>();
    const elements = policy.ast.properties(literal).map(element => element === undefined
      ? undefined : policy.semantics(sourceFile).operations.objectLiteralElement(element));
    for (const type of unionTypes) {
      reserveClassification();
      const carrier = selectCsharpObjectLiteralUnionCarrier(type, elements, policy.objectShapes.resolveTarget,
        (element, candidate) => csharpObjectLiteralDestinationDeclarations(element, candidate, policy.semantics(sourceFile)),
        policy.typeDefinitions, evidence.nodeTargetType.get(literal));
      if (carrier !== undefined) {
        unionCarriers.set(targetTypeRefKey(type), carrier);
        rememberShape(policy.objectShapes.resolveTarget(carrier));
      }
    }
    literalUnionCarriers.set(literal, unionCarriers);
    const results = new Map<string, CsharpObjectLiteralTargetShapeResolution>();
    literalResults.set(literal, results);
    const contextualShape = policy.objectShapes.resolveType(
      evidence.contextualType.get(literal),
      sourceFile,
    );
    const expectedShapes = new Set<CsharpObjectShapeFact | undefined>([
      undefined,
      byNode.get(literal),
      contextualShape,
    ]);
    for (const shape of expectedShapes) {
      classifyLiteral(shape, literal);
    }
  }

  function classifyLiteral(expected: CsharpObjectShapeFact | undefined, literal: Node): CsharpObjectLiteralTargetShapeResolution | undefined {
    const results = literalResults.get(literal);
    const sourceFile = objectLiterals.get(literal);
    if (results === undefined || sourceFile === undefined) return undefined;
    const key = expected === undefined ? noExpectedShape : csharpObjectShapeContractKey(expected);
    const previous = results.get(key);
    if (previous !== undefined) return previous;
    reserveClassification();
    const result = policy.objectShapes.resolveObjectLiteralTargetShape(expected, literal, sourceFile);
    results.set(key, result);
    if (result.kind === "resolved") {
      admittedShapes.add(result.shape);
      rememberShape(result.shape);
      const implementation = result.shape.methodImplementation;
      if (implementation !== undefined && implementation.declaration !== literal) copiedMethodImplementations.add(implementation.identity);
    }
    return result;
  }

  const classifications: CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration & { seal(): CsharpObjectShapeAnalysis } = {
    propertyOrder: propertyOrders.propertyOrder,
    assignmentSourceOrder: propertyOrders.assignmentSourceOrder,
    structuralImplementations,
    knownShapes() {
      if (sealed) return knownShapes;
      closeStructuralShapes();
      for (const shape of byTarget.values()) admittedShapes.add(shape);
      return Object.freeze([...byTarget.values()].map(shape => withInterfaces(shape)!));
    },
    methodImplementationHasCopies(shape) {
      const implementation = (shape.declarationTemplate ?? shape).methodImplementation;
      return implementation !== undefined && copiedMethodImplementations.has(implementation.identity);
    },
    registerStructuralInterface(expression, source, destination, sourceType) {
      if (sealed) throw new Error("C# structural-interface analysis is sealed.");
      if (getCsharpNullableElementTargetType(source) !== undefined &&
        getCsharpNullableElementTargetType(destination) === undefined) return false;
      source = getCsharpNullableElementTargetType(source) ?? source;
      destination = getCsharpNullableElementTargetType(destination) ?? destination;
      const sourceShape = byTarget.get(targetTypeRefKey(source)) ?? policy.objectShapes.resolveTarget(source);
      const destinationShape = byTarget.get(targetTypeRefKey(destination)) ?? policy.objectShapes.resolveTarget(destination);
      if (sourceShape === undefined || destinationShape === undefined ||
        !targetTypeRefEquals(sourceShape.targetType, source) ||
        !targetTypeRefEquals(destinationShape.targetType, destination)) return false;
      rememberShape(sourceShape);
      rememberShape(destinationShape);
      const selected = selectCsharpStructuralInterface(policy, expression, sourceShape, destinationShape, sourceType);
      if (selected === undefined || selected.sourceType.kind !== "target-named") return false;
      if (selected.interfaceType.kind === "target-named" && selected.sourceType.id === selected.interfaceType.id) {
        return targetTypeRefEquals(selected.sourceType, selected.interfaceType);
      }
      const key = selected.sourceType.id;
      const targetKey = targetTypeRefKey(selected.interfaceType);
      let interfaces = structuralInterfaces.get(key);
      if (interfaces === undefined) { interfaces = new Map(); structuralInterfaces.set(key, interfaces); }
      const declared = policy.projectTypes.directSupertypes(source) ?? [];
      const directlyDeclared = source.kind === "target-named" &&
        (source as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "class" &&
        declared.some(type => targetTypeRefEquals(type, selected.interfaceType));
      const inherited = [...sourceShape.implements ?? [], ...declared].map(type => ({ type,
        nativeBase: type.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "class" }));
      const visited = new Set<string>();
      const nativeBaseInterfaces = new Set<string>();
      for (let index = 0; index < inherited.length; index++) {
        const { type, nativeBase } = inherited[index]!;
        const inheritedKey = targetTypeRefKey(type);
        if (visited.has(inheritedKey) && (!nativeBase || nativeBaseInterfaces.has(inheritedKey))) continue;
        visited.add(inheritedKey);
        if (nativeBase) nativeBaseInterfaces.add(inheritedKey);
        inherited.push(...(policy.projectTypes.directSupertypes(type) ?? []).map(type => ({ type, nativeBase })));
      }
      if (!interfaces.has(targetKey) && (!visited.has(targetKey) || directlyDeclared ||
        !nativeBaseInterfaces.has(targetKey) && (selected.properties.length > 0 || selected.methods.length > 0))) {
        reserveClassification();
        interfaces.set(targetKey, Object.freeze({ selected, source, destination,
          ...(sourceType === undefined ? {} : { sourceType }) }));
        structuralRevision += 1;
        rememberShape(policy.objectShapes.resolveTarget(selected.interfaceType));
      }
      return true;
    },
    seal() {
      if (sealed) throw new Error("C# object-shape analysis is sealed.");
      closeStructuralShapes();
      for (const shape of byTarget.values()) admittedShapes.add(shape);
      for (const shape of admittedShapes) {
        propertyOrders.record(shape);
        if (shape.declarationTemplate !== undefined) admittedShapes.add(shape.declarationTemplate);
      }
      for (const literal of objectLiterals.keys()) propertyOrders.recordEmptyLiteral(literal);
      propertyOrders.seal();
      const completeShape = (shape: CsharpObjectShapeFact): CsharpObjectShapeFact => {
        const existing = completedShapes.get(shape);
        if (existing !== undefined) return existing;
        const selected = Object.freeze(withInterfaces(shape)!);
        completedShapes.set(shape, selected);
        return selected;
      };
      for (const shape of admittedShapes) completeShape(shape);
      for (const [node, shape] of byNode) byNode.set(node, completeShape(shape));
      for (const shape of byTarget.values()) {
        const selected = completeShape(shape);
        if (selected.targetType.kind === "target-named" && (selected.targetType.typeArguments?.length ?? 0) > 0 &&
            selected.targetType.typeArguments!.every(argument => argument.kind === "type-parameter")) {
          templates.set(selected.targetType.id, selected);
        }
      }
      for (const [key, shape] of copies) copies.set(key, completeShape(shape));
      for (const literal of objectLiterals.keys()) {
        for (const [key, result] of literalResults.get(literal) ?? []) {
          if (result.kind === "resolved") literalResults.get(literal)!.set(key,
            Object.freeze({ ...result, shape: completeShape(result.shape) }));
        }
      }
      const publishedShapes = [...byTarget.values()].map(completeShape).concat([...byNode.values()], [...copies.values()],
        [...objectLiterals.keys()].flatMap(literal =>
          [...literalResults.get(literal)?.values() ?? []].flatMap(result => result.kind === "resolved" ? [result.shape] : [])));
      const demandedTypes = [...evidence.targetTypes, ...operationTypes, ...physicalTypes];
      const shapeQueue = [...publishedShapes];
      const demandedKeys = new Set<string>();
      const walkedShapes = new Set<CsharpObjectShapeFact>();
      for (let typeIndex = 0, shapeIndex = 0; typeIndex < demandedTypes.length || shapeIndex < shapeQueue.length;) {
        if (shapeIndex < shapeQueue.length) {
          const shape = shapeQueue[shapeIndex++]!;
          if (walkedShapes.has(shape)) continue;
          walkedShapes.add(shape);
          demandedTypes.push(...csharpTargetTypeComponents(shape.targetType, shape));
          if (shape.declarationTemplate !== undefined) {
            demandedTypes.push(...csharpTargetTypeComponents(shape.declarationTemplate.targetType, shape.declarationTemplate));
          }
          continue;
        }
        const type = demandedTypes[typeIndex++]!;
        const typeKey = targetTypeRefKey(type);
        if (demandedKeys.has(typeKey)) continue;
        demandedKeys.add(typeKey);
        const element = getCsharpNullableElementTargetType(type) ?? type;
        const key = targetTypeRefKey(element);
        const known = byTarget.get(key);
        if (known !== undefined) {
          shapeQueue.push(completeShape(known));
          continue;
        }
        if (instantiatedShapes.has(key)) continue;
        const template = element.kind === "target-named" ? templates.get(element.id) : undefined;
        const instance = template === undefined ? undefined : instantiateCsharpObjectShape(template, element);
        if (instance === undefined) {
          demandedTypes.push(...csharpTargetTypeComponents(type));
          continue;
        }
        reserveClassification();
        instantiatedShapes.set(key, Object.freeze(instance));
        shapeQueue.push(instance);
      }
      const returnedShapes = [...publishedShapes, ...instantiatedShapes.values()];
      const structuralImplementationTypes: TargetTypeRef[] = [];
      for (const shape of returnedShapes) {
        const type = shape.targetType;
        const key = targetTypeRefKey(type);
        if (type.kind !== "target-named" || (structuralInterfaces.get(type.id)?.size ?? 0) === 0 || sealedStructuralImplementations.has(key)) continue;
        reserveClassification();
        sealedStructuralImplementations.set(key, Object.freeze(structuralImplementations(type)));
        structuralImplementationTypes.push(type);
      }
      const completeKnownShapes = new Map([...byTarget.values()].map(shape => {
        const completed = completeShape(shape);
        return [targetTypeRefKey(completed.targetType), completed] as const;
      }));
      for (const shape of returnedShapes) {
        const key = targetTypeRefKey(shape.targetType);
        if (!completeKnownShapes.has(key)) completeKnownShapes.set(key, shape);
      }
      knownShapes = Object.freeze([...completeKnownShapes.values()]);
      admittedShapes.clear();
      sealed = true;
      return Object.freeze({
        issues: Object.freeze([...declaredStructuralIssues, ...structuralIssues]),
        propertyOrder: propertyOrders.propertyOrder,
        assignmentSourceOrder: propertyOrders.assignmentSourceOrder,
        structuralImplementations: sealedStructuralImplementation,
        structuralImplementationTypes: Object.freeze(structuralImplementationTypes),
        knownShapes: () => knownShapes,
        methodImplementationHasCopies: classifications.methodImplementationHasCopies,
        resolveCopyShape: (shape: CsharpObjectShapeFact) => copies.get(targetTypeRefKey(shape.targetType)),
        resolveObjectLiteralUnionCarrier: (node: Node, type: TargetTypeRef) => literalUnionCarriers.get(node)?.get(targetTypeRefKey(type)),
        resolveNode: (node: Node | undefined) => node === undefined ? undefined : byNode.get(node),
        resolveTarget: completedTargetShape,
        resolveObjectLiteralTargetShape: completedLiteralResult,
      });
    },
    resolveObjectLiteralUnionCarrier(node, type) {
      return literalUnionCarriers.get(node)?.get(targetTypeRefKey(type));
    },
    resolveCopyShape(shape) {
      if (!sealed) {
        rememberShape(shape);
        preparePhysicalShapes();
      }
      const copy = copies.get(targetTypeRefKey(shape.targetType));
      if (!sealed && copy !== undefined) admittedShapes.add(copy);
      return copy;
    },
    resolveNode(node: Node | undefined) {
      const shape = node === undefined ? undefined : byNode.get(node);
      return sealed ? shape : withInterfaces(shape);
    },
    resolveTarget(type) {
      if (type === undefined) return undefined;
      if (sealed) return completedTargetShape(type);
      let shape = byTarget.get(targetTypeRefKey(type));
      if (shape === undefined && !sealed) {
        shape = policy.objectShapes.resolveTarget(type);
        rememberTargetShape(type, shape);
      }
      if (!sealed && shape !== undefined) admittedShapes.add(shape);
      return withInterfaces(shape);
    },
    resolveObjectLiteralTargetShape(expectedShape, objectLiteral) {
      if (sealed) return completedLiteralResult(expectedShape, objectLiteral);
      const original = expectedShape === undefined ? undefined
        : byTarget.get(targetTypeRefKey(expectedShape.targetType)) ?? expectedShape;
      const key = original === undefined
        ? noExpectedShape
        : csharpObjectShapeContractKey(original);
      const result = literalResults.get(objectLiteral)?.get(key) ?? classifyLiteral(original, objectLiteral);
      return result?.kind === "resolved"
        ? { ...result, shape: withInterfaces(result.shape)! } : result;
    },
  };
  return Object.freeze(classifications);

  function completedTargetShape(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined {
    if (type === undefined) return undefined;
    const key = targetTypeRefKey(getCsharpNullableElementTargetType(type) ?? type);
    const shape = byTarget.get(key);
    return shape === undefined ? instantiatedShapes.get(key) : completedShapes.get(shape);
  }

  function sealedStructuralImplementation(type: TargetTypeRef): readonly CsharpStructuralInterfaceImplementation[] {
    if (type.kind !== "target-named" || (structuralInterfaces.get(type.id)?.size ?? 0) === 0) return noStructuralImplementations;
    const key = targetTypeRefKey(type);
    const selected = sealedStructuralImplementations.get(key);
    if (selected === undefined) {
      throw new Error(`C# sealed object-shape reader has no structural-implementation record for '${key}'.`);
    }
    return selected;
  }

  function completedLiteralResult(expectedShape: CsharpObjectShapeFact | undefined, objectLiteral: Node):
      CsharpObjectLiteralTargetShapeResolution | undefined {
    const original = expectedShape === undefined ? undefined : byTarget.get(targetTypeRefKey(expectedShape.targetType)) ?? expectedShape;
    return literalResults.get(objectLiteral)?.get(original === undefined ? noExpectedShape : csharpObjectShapeContractKey(original));
  }

  function visit(node: Node, sourceFile: SourceFile): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    const operation = operations.selectedCall.get(node) ?? operations.selectedConstruction.get(node);
    for (const type of operation?.sourceArgumentParameterTypes ?? []) {
      if (type !== undefined) operationTypes.push(type);
    }
    const shape = policy.objectShapes.resolveNode(node, sourceFile);
    if (shape !== undefined) {
      reserveClassification();
      byNode.set(node, shape);
      admittedShapes.add(shape);
      rememberShape(shape);
    }
    if (policy.ast.is.IsObjectLiteralExpression(node)) {
      objectLiterals.set(node, sourceFile);
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child, sourceFile);
      }
    });
  }

  function reserveClassification(): void {
    classificationCount += 1;
    if (classificationCount > maximumObjectShapeClassifications) {
      throw new Error(
        `C# object-shape analysis exceeds its finite ${maximumObjectShapeClassifications}-classification budget.`,
      );
    }
  }
}
