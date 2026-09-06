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
} from "../../policy/types/index.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpObjectShapeClassifications } from "./model.js";

const noExpectedShape = "<none>";
const maximumObjectShapeClassifications = 131_072;

export function analyzeCsharpObjectShapes(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): CsharpObjectShapeClassifications {
  const byNode = new WeakMap<Node, CsharpObjectShapeFact>();
  const byTarget = new Map<string, CsharpObjectShapeFact>();
  const objectLiterals = new Map<Node, SourceFile>();
  let classificationCount = 0;

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
  for (const [literal, sourceFile] of objectLiterals) {
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

  const classifications: CsharpObjectShapeClassifications = {
    resolveNode(node: Node | undefined) {
      return node === undefined ? undefined : byNode.get(node);
    },
    resolveTarget(type) {
      return type === undefined
        ? undefined
        : byTarget.get(targetTypeRefKey(type));
    },
    resolveObjectLiteralTargetShape(expectedShape, objectLiteral) {
      const key = expectedShape === undefined
        ? noExpectedShape
        : csharpObjectShapeContractKey(expectedShape);
      return literalResults.get(objectLiteral)?.get(key);
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
