import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/context.js";
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
  getCsharpRuntimeUnionArms,
} from "../../policy/types/index.js";
import { selectCsharpObjectLiteralUnionShape } from "../../policy/types/objects/object-shape-policy/union-construction.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpObjectShapeClassifications } from "./model.js";
import { selectCsharpStructuralInterface, type CsharpStructuralInterfaceRegistration } from "./structural-interfaces.js";
import { mergeCsharpObjectShapeSubjects } from "../../policy/types/objects/object-shape-policy/construction.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/nullable.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";

const noExpectedShape = "<none>";
const maximumObjectShapeClassifications = 131_072;

export function analyzeCsharpObjectShapes(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration & { seal(): CsharpObjectShapeClassifications } {
  const byNode = new WeakMap<Node, CsharpObjectShapeFact>();
  const byTarget = new Map<string, CsharpObjectShapeFact>();
  const copies = new Map<string, CsharpObjectShapeFact>();
  const objectLiterals = new Map<Node, SourceFile>();
  let classificationCount = 0;
  let sealed = false;
  const structuralInterfaces = new Map<string, Map<string, TargetTypeRef>>();
  const withInterfaces = (shape: CsharpObjectShapeFact | undefined): CsharpObjectShapeFact | undefined => {
    if (shape === undefined) return undefined;
    const additional = structuralInterfaces.get(targetTypeRefKey(shape.targetType));
    return additional === undefined ? shape : { ...shape, implements: Object.freeze([
      ...(shape.implements ?? []), ...additional.values(),
    ]) };
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
      byTarget.set(key, mergeCsharpObjectShapeSubjects(previous, shape));
    }
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
      byTarget.set(key, mergeCsharpObjectShapeSubjects(previous, shape));
    }
  };

  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile, sourceFile);
  }
  for (const type of evidence.targetTypes) {
    rememberTargetShape(type, policy.objectShapes.resolveTarget(type));
  }

  const literalResults = new WeakMap<
    Node,
    ReadonlyMap<string, CsharpObjectLiteralTargetShapeResolution>
  >();
  const literalUnionShapes = new WeakMap<Node, ReadonlyMap<string, CsharpObjectShapeFact>>();
  const unionTypes = evidence.targetTypes.filter(type =>
    getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(type) ?? type) !== undefined);
  for (const [literal, sourceFile] of objectLiterals) {
    const unionShapes = new Map<string, CsharpObjectShapeFact>();
    const elements = policy.ast.properties(literal).map(element => element === undefined
      ? undefined : policy.semantics(sourceFile).operations.objectLiteralElement(element));
    for (const type of unionTypes) {
      reserveClassification();
      const shape = selectCsharpObjectLiteralUnionShape(type, elements, policy.objectShapes.resolveTarget);
      if (shape !== undefined) {
        unionShapes.set(targetTypeRefKey(type), shape);
        rememberShape(shape);
      }
    }
    literalUnionShapes.set(literal, unionShapes);
    const results = new Map<string, CsharpObjectLiteralTargetShapeResolution>();
    const contextualShape = policy.objectShapes.resolveType(
      evidence.contextualType(literal),
      sourceFile,
    );
    const expectedShapes = new Set<CsharpObjectShapeFact | undefined>([
      undefined,
      byNode.get(literal),
      contextualShape,
      ...byTarget.values(),
    ]);
    for (const shape of expectedShapes) {
      classifyLiteral(shape);
    }
    literalResults.set(literal, results);

    function classifyLiteral(expected: CsharpObjectShapeFact | undefined): void {
      const key = expected === undefined
        ? noExpectedShape
        : csharpObjectShapeContractKey(expected);
      if (results.has(key)) {
        return;
      }
      reserveClassification();
      const result = policy.objectShapes.resolveObjectLiteralTargetShape(
        expected,
        literal,
        sourceFile,
      );
      results.set(key, result);
      if (result.kind === "resolved") {
        rememberShape(result.shape);
      }
    }
  }

  const classifications: CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration & { seal(): CsharpObjectShapeClassifications } = {
    knownShapes() {
      return Object.freeze([...byTarget.values()].map(shape => withInterfaces(shape)!));
    },
    registerStructuralInterface(expression, source, destination) {
      if (sealed) throw new Error("C# structural-interface analysis is sealed.");
      source = getCsharpNullableElementTargetType(source) ?? source;
      destination = getCsharpNullableElementTargetType(destination) ?? destination;
      const sourceShape = byTarget.get(targetTypeRefKey(source));
      const destinationShape = byTarget.get(targetTypeRefKey(destination));
      if (!selectCsharpStructuralInterface(policy, expression, sourceShape, destinationShape)) return false;
      const key = targetTypeRefKey(source);
      const targetKey = targetTypeRefKey(destination);
      let interfaces = structuralInterfaces.get(key);
      if (interfaces === undefined) { interfaces = new Map(); structuralInterfaces.set(key, interfaces); }
      if (!interfaces.has(targetKey) && !(sourceShape?.implements ?? []).some(type => targetTypeRefKey(type) === targetKey)) {
        reserveClassification();
        interfaces.set(targetKey, destination);
      }
      return true;
    },
    seal() {
      const pending = [...byTarget.values()].flatMap(shape => [shape.targetType, ...shape.members.map(member => member.type), ...shape.implements ?? []]);
      const visited = new Set<string>();
      for (let index = 0; index < pending.length; index++) {
        const type = pending[index]!;
        const key = targetTypeRefKey(type);
        if (visited.has(key)) continue;
        visited.add(key);
        reserveClassification();
        const shape = policy.objectShapes.resolveTarget(type);
        rememberShape(shape);
        if (shape !== undefined) {
          const copy = policy.objectShapes.resolveCopyShape(shape);
          copies.set(key, copy);
          if (copy !== shape) {
            rememberShape(copy);
            pending.push(copy.targetType);
          }
        }
        pending.push(...csharpTargetTypeComponents(type, shape));
      }
      sealed = true;
      const { registerStructuralInterface: _register, seal: _seal, ...snapshot } = classifications;
      return Object.freeze(snapshot);
    },
    resolveObjectLiteralUnionShape(node, type) {
      return literalUnionShapes.get(node)?.get(targetTypeRefKey(type));
    },
    resolveCopyShape(shape) {
      return copies.get(targetTypeRefKey(shape.targetType));
    },
    resolveNode(node: Node | undefined) {
      return withInterfaces(node === undefined ? undefined : byNode.get(node));
    },
    resolveTarget(type) {
      return type === undefined
        ? undefined
        : withInterfaces(byTarget.get(targetTypeRefKey(type)));
    },
    resolveObjectLiteralTargetShape(expectedShape, objectLiteral) {
      const original = expectedShape === undefined ? undefined
        : byTarget.get(targetTypeRefKey(expectedShape.targetType)) ?? expectedShape;
      const key = original === undefined
        ? noExpectedShape
        : csharpObjectShapeContractKey(original);
      const result = literalResults.get(objectLiteral)?.get(key);
      return result?.kind === "resolved"
        ? { ...result, shape: withInterfaces(result.shape)! } : result;
    },
  };
  return Object.freeze(classifications);

  function visit(node: Node, sourceFile: SourceFile): void {
    if (evidence.isCompileTimeMetadata(node)) return;
    const shape = policy.objectShapes.resolveNode(node, sourceFile);
    if (shape !== undefined) {
      reserveClassification();
      byNode.set(node, shape);
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
