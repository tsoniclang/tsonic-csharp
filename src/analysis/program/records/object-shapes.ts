import { type CsharpObjectShapeClassifications, type CsharpObjectShapeRecords, type CsharpObjectShapeAnalysis, type CsharpObjectLiteralTargetShapeResolution } from "../../../target-model/records/object-shapes.js";
import { type Node } from "@tsonic/tsts";
import { type CsharpObjectShapeFact, type CsharpStructuralInterfaceImplementation, type TargetTypeRef } from "../../../target-model/types/model.js";
import { type CsharpProjectTypeIssue } from "../../../target-model/records/project-types.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpObjectShapeContractKey } from "../../../target-model/types/object-shape-identity.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function createCsharpObjectShapeRecords(sealed: Pick<CsharpObjectShapeClassifications, "resolveNode" | "resolveTarget">): CsharpObjectShapeRecords {
  return Object.freeze({ nodeObjectShape: Object.freeze({ get: sealed.resolveNode }), targetObjectShape: Object.freeze({ get: sealed.resolveTarget }) });
}











export function sealCsharpObjectShapeClassifications(input: {
  readonly issues: readonly CsharpProjectTypeIssue[];
  readonly propertyOrders: Pick<CsharpObjectShapeClassifications, "propertyOrder" | "assignmentSourceOrder">;
  readonly structuralDefinitionIds: ReadonlySet<string>;
  readonly structuralImplementations: ReadonlyMap<string, readonly CsharpStructuralInterfaceImplementation[]>;
  readonly structuralImplementationTypes: readonly TargetTypeRef[];
  readonly targetShapes: Readonly<Record<string, CsharpObjectShapeFact>>;
  readonly targets: ReadonlyMap<string, CsharpObjectShapeFact>;
  readonly nodes: ReadonlyMap<Node, CsharpObjectShapeFact>;
  readonly knownShapes: readonly CsharpObjectShapeFact[];
  readonly copies: ReadonlyMap<string, CsharpObjectShapeFact>;
  readonly copiedMethodImplementations: ReadonlySet<string>;
  readonly literals: readonly {
    readonly literal: Node;
    readonly results: ReadonlyMap<string, CsharpObjectLiteralTargetShapeResolution>;
    readonly unions: ReadonlyMap<string, TargetTypeRef>;
  }[];
}): CsharpObjectShapeAnalysis {
  const targets = new Map(input.targets);
  const nodes = new WeakMap(input.nodes);
  const copies = new Map(input.copies);
  const copiedMethods = new Set(input.copiedMethodImplementations);
  const structuralDefinitions = new Set(input.structuralDefinitionIds);
  const implementations = new Map(input.structuralImplementations);
  const literals = new WeakMap(input.literals.map(entry =>
    [entry.literal, { results: new Map(entry.results), unions: new Map(entry.unions) }] as const));
  const targetShapes = Object.freeze({ ...input.targetShapes });
  const knownShapes = Object.freeze([...input.knownShapes]);
  return Object.freeze({
    issues: Object.freeze([...input.issues]),
    propertyOrder: input.propertyOrders.propertyOrder,
    assignmentSourceOrder: input.propertyOrders.assignmentSourceOrder,
    structuralImplementationTypes: Object.freeze([...input.structuralImplementationTypes]),
    structuralImplementations(type: TargetTypeRef): readonly CsharpStructuralInterfaceImplementation[] {
      if (type.kind !== "target-named" || !structuralDefinitions.has(type.id)) return noStructuralImplementations;
      const key = targetTypeRefKey(type);
      const selected = implementations.get(key);
      if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        `C# sealed object-shape reader has no structural-implementation record for '${key}'.`);
      return selected;
    },
    targetShapes,
    knownShapes: () => knownShapes,
    methodImplementationHasCopies(shape: CsharpObjectShapeFact): boolean {
      const implementation = (shape.declarationTemplate ?? shape).methodImplementation;
      return implementation !== undefined && copiedMethods.has(implementation.identity);
    },
    resolveCopyShape: (shape: CsharpObjectShapeFact) => copies.get(targetTypeRefKey(shape.targetType)),
    resolveObjectLiteralUnionCarrier: (node: Node, type: TargetTypeRef) => literals.get(node)?.unions.get(targetTypeRefKey(type)),
    resolveNode: (node: Node | undefined) => node === undefined ? undefined : nodes.get(node),
    resolveTarget(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined {
      return type === undefined ? undefined : targetShapes[targetTypeRefKey(getCsharpNullableElementTargetType(type) ?? type)];
    },
    resolveObjectLiteralTargetShape(expected: CsharpObjectShapeFact | undefined, literal: Node): CsharpObjectLiteralTargetShapeResolution | undefined {
      const original = expected === undefined ? undefined : targets.get(targetTypeRefKey(expected.targetType)) ?? expected;
      const key = original === undefined ? "<none>" : csharpObjectShapeContractKey(original);
      return literals.get(literal)?.results.get(key);
    },
  });
}

const noStructuralImplementations: readonly CsharpStructuralInterfaceImplementation[] = Object.freeze([]);
