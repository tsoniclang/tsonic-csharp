import { type CsharpObjectShapeClassifications, type CsharpObjectShapeRecords, type CsharpObjectShapeAnalysis, type CsharpObjectLiteralTargetShapeResolution } from "../../../../target-model/records/objects/object-shapes.js";
import { type Node } from "@tsonic/tsts";
import { type CsharpObjectShapeFact, type CsharpStructuralInterfaceImplementation, type TargetTypeRef } from "../../../../target-model/types/model.js";
import { type CsharpProjectTypeIssue } from "../../../../target-model/records/types/project-types.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceStructuralMember } from "@tsonic/target-api/source";
import { csharpObjectShapeContractKey } from "../../../../target-model/types/object-shape-identity.js";

export function createCsharpObjectLiteralShapeKey(): (shape: CsharpObjectShapeFact | undefined) => string {
  const identities = new WeakMap<object, number>();
  let nextIdentity = 0;
  const identity = (subject: object | undefined): number | null => {
    if (subject === undefined) return null;
    const previous = identities.get(subject);
    if (previous !== undefined) return previous;
    const selected = ++nextIdentity;
    identities.set(subject, selected);
    return selected;
  };
  const checkedMember = (member: SourceStructuralMember): readonly unknown[] => [
    identity(member.receiverType), identity(member.property.symbol), identity(member.property.type),
    member.property.optional, member.property.readonly, member.read,
    member.property.rootSymbols.map(identity), member.declarations.map(identity),
    member.getters.map(identity), member.setters.map(identity),
  ];
  const describe = (shape: CsharpObjectShapeFact): readonly unknown[] => [
    csharpObjectShapeContractKey(shape), identity(shape.sourceType),
    shape.members.map(member => [
      member.sourceSubjects?.map(identity), member.sourceDeclarations?.map(identity), member.sourceTypes?.map(identity),
      member.readonly === true,
      member.typeParameters?.map(parameter => identity(parameter.declaration)),
      member.sourceMemberEvidence?.map(evidence => [identity(evidence.ownerType), identity(evidence.sourceType),
        evidence.correspondence.kind, checkedMember(evidence.correspondence.destination),
        evidence.correspondence.kind === "present" ? checkedMember(evidence.correspondence.source) : null]),
    ]),
    shape.methodImplementation === undefined ? null : [identity(shape.methodImplementation.declaration),
      shape.methodImplementation.methods.map(identity),
      shape.methodImplementation.captures.map(capture => [identity(capture.declaration), identity(capture.reference)])],
    shape.declarationTemplate === undefined ? null : describe(shape.declarationTemplate),
  ];
  return shape => shape === undefined ? "no-expected-shape" : JSON.stringify(describe(shape));
}

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
  readonly nodes: ReadonlyMap<Node, CsharpObjectShapeFact>;
  readonly knownShapes: readonly CsharpObjectShapeFact[];
  readonly copies: ReadonlyMap<string, CsharpObjectShapeFact>;
  readonly copiedMethodImplementations: ReadonlySet<string>;
  readonly literalKey: (shape: CsharpObjectShapeFact | undefined) => string;
  readonly literals: readonly {
    readonly literal: Node;
    readonly results: ReadonlyMap<string, CsharpObjectLiteralTargetShapeResolution>;
    readonly unions: ReadonlyMap<string, TargetTypeRef>;
  }[];
}): CsharpObjectShapeAnalysis {
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
      return literals.get(literal)?.results.get(input.literalKey(expected));
    },
  });
}

const noStructuralImplementations: readonly CsharpStructuralInterfaceImplementation[] = Object.freeze([]);
