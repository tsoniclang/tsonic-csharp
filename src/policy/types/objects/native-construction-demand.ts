import { providerVirtualDeclarationFactKey, type Node, type SourceFile, type Type } from "@tsonic/tsts";
import type { SourceStorageQueries, SourceStorageSubject } from "@tsonic/target-api/analysis";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpObjectShapesEqual } from "../../../target-model/types/object-shape-equality.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpNullableTargetType } from "../../../target-model/types/nullable.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";
import type { CsharpTypePolicyBaseHost } from "../resolution/model.js";
import { csharpNativeConstructionMembersMatch } from "./native-construction-members.js";

export interface CsharpNativeConstructionIssue {
  readonly node: Node;
  readonly code: "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN";
  readonly message: string;
}

export interface CsharpNativeConstructionDemandQueries {
  readonly issues: readonly CsharpNativeConstructionIssue[];
  constructionFor(node: Node): CsharpNativeConstructionSelection | undefined;
}

export interface CsharpNativeConstructionSelection {
  readonly targetType: TargetTypeRef;
  readonly shape: CsharpObjectShapeFact;
}

interface CsharpNativeConstructionDemandHost extends Pick<CsharpTypePolicyBaseHost,
  "ast" | "navigation" | "providers" | "sourceFacts" | "semantics" | "semanticsFor"> {
  resolveShape(type: Type, file: SourceFile, authoredTypeRoot?: Node): CsharpObjectShapeFact | undefined;
  retainSourceShape(node: Node, type: Type, shape: CsharpObjectShapeFact, file: SourceFile): CsharpObjectShapeFact | undefined;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
}

interface CsharpNativeConstructionType {
  readonly type: Type;
  readonly nullable: boolean;
  readonly queries: SourceFileSemantics;
}

export function createCsharpNativeConstructionDemandQuery(
  storage: SourceStorageQueries,
  host: CsharpNativeConstructionDemandHost,
): CsharpNativeConstructionDemandQueries {
  const budget = createCsharpMetadataBudget();
  const types = new Map<SourceStorageSubject, CsharpNativeConstructionType | undefined>();
  const unresolvedTypes = new Map<SourceStorageSubject, string>();
  const demands = new Map<SourceStorageSubject, CsharpObjectShapeFact>();
  const shapes = new WeakMap<Type, CsharpObjectShapeFact | null>();
  const compatibility = new WeakMap<Type, WeakMap<CsharpObjectShapeFact, boolean>>();
  const emptyCompatibility = new Map<SourceStorageSubject, WeakMap<CsharpObjectShapeFact, boolean>>();
  const destinations = new Map<SourceStorageSubject, SourceStorageSubject[]>();
  const constructions = new WeakMap<CsharpObjectShapeFact, Map<boolean, CsharpNativeConstructionSelection>>();
  const nodeConstructions = new Map<Node, CsharpNativeConstructionSelection>();
  const pending: { readonly subject: SourceStorageSubject; readonly shape: CsharpObjectShapeFact }[] = [];
  const issues: CsharpNativeConstructionIssue[] = [];
  const rejected = new Set<SourceStorageSubject>();
  const issue = (subject: SourceStorageSubject, message: string): void => {
    if (rejected.has(subject)) return;
    budget.reserve(1);
    rejected.add(subject);
    issues.push(Object.freeze({ node: subject.node, code: "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", message }));
  };
  const selectedType = (subject: SourceStorageSubject, required = false): CsharpNativeConstructionType | undefined => {
    if (types.has(subject)) {
      const reason = unresolvedTypes.get(subject);
      if (required && reason !== undefined) issue(subject, reason);
      return types.get(subject);
    }
    budget.reserve(1);
    const selected = storage.typeFor(subject);
    if (selected.kind !== "resolved") {
      if (required) issue(subject, selected.reason);
      unresolvedTypes.set(subject, selected.reason);
      types.set(subject, undefined);
      return undefined;
    }
    const queries = host.semantics(selected.sourceFile);
    const members = queries.types.isUnion(selected.type)
      ? queries.types.unionOrIntersectionTypes(selected.type).filter(type => !queries.types.isNullish(type))
      : queries.types.isNullish(selected.type) ? [] : [selected.type];
    if (members.length > 1) {
      const reason = "Native construction storage requires one exact non-absent source type.";
      unresolvedTypes.set(subject, reason);
      if (required) issue(subject, reason);
    }
    const result = members.length === 1 ? { type: members[0]!, nullable: members[0] !== selected.type, queries } : undefined;
    types.set(subject, result);
    return result;
  };
  const shapeForType = (type: Type, queries: SourceFileSemantics): CsharpObjectShapeFact | undefined => {
    if (shapes.has(type)) return shapes.get(type) ?? undefined;
    budget.reserve(1);
    const shape = host.resolveShape(type, queries.sourceFile);
    shapes.set(type, shape ?? null);
    return shape;
  };
  const nativeShape = (type: Type, queries: SourceFileSemantics): CsharpObjectShapeFact | undefined => {
    const present = queries.types.isUnion(type)
      ? queries.types.unionOrIntersectionTypes(type).filter(member => !queries.types.isNullish(member))
      : queries.types.isNullish(type) ? [] : [type];
    if (present.length !== 1 || queries.types.constructSignatures(present[0]!).length !== 0) return undefined;
    let native = false;
    for (const subject of queries.facts.typeSubjects(present[0]!)) {
      budget.reserve(1);
      const fact = host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
      if (fact === undefined) continue;
      const provider = host.providers.resolveType(fact);
      if (provider.kind === "resolved" && provider.relations.some(relation =>
        relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer")) native = true;
    }
    return native ? shapeForType(present[0]!, queries) : undefined;
  };
  const emptyOriginsMatch = (subject: SourceStorageSubject, selected: CsharpNativeConstructionType,
    destination: CsharpObjectShapeFact): boolean => {
    const origins = storage.closedOriginsFor(subject);
    if (origins.kind !== "complete") {
      issue(subject, origins.kind === "unresolved" ? origins.reason
        : "Native empty construction requires a complete source storage domain.");
      return false;
    }
    let present = false;
    for (const origin of origins.origins) {
      budget.reserve(1);
      const queries = host.semantics(origin.sourceFile);
      if (queries.types.isNullish(origin.type)) {
        if (!selected.nullable) return false;
        continue;
      }
      const expressionType = queries.types.expressionType(origin.subject.node);
      if (origin.subject.kind !== "value" || origin.subject.projection.length !== 0 ||
        !host.ast.is.IsObjectLiteralExpression(origin.subject.node) ||
        !host.navigation.isProjectDeclaration(origin.subject.node) || host.ast.properties(origin.subject.node).length !== 0 ||
        expressionType === undefined || !queries.types.isIdentical(expressionType, origin.type) ||
        !selected.queries.types.isIdentical(selected.type, origin.type)) return false;
      const shape = host.resolveShape(origin.type, queries.sourceFile, origin.subject.node);
      if (!csharpNativeConstructionMembersMatch(origin.type, shape, destination, queries, host, budget.reserve)) return false;
      present = true;
    }
    return present;
  };
  let current: SourceStorageSubject | undefined;
  try {
    for (const subject of storage.subjects) {
      current = subject;
      const selected = selectedType(subject);
      if (selected === undefined || selected.queries.types.constructSignatures(selected.type).length !== 0) continue;
      const shape = nativeShape(selected.type, selected.queries);
      if (shape === undefined) continue;
      if (shape?.constructible !== true || shape.sourceType === undefined) {
        issue(subject, "An exact native construction demand has no finalized provider object-initializer contract.");
        continue;
      }
      budget.reserve(1);
      pending.push({ subject, shape });
    }
    if (pending.length !== 0) {
      for (const subject of storage.subjects) {
        current = subject;
        budget.reserve(1);
        const incoming = storage.incomingFor(subject);
        if (incoming.kind !== "resolved") continue;
        for (const origin of incoming.subjects) {
          budget.reserve(1);
          const values = destinations.get(origin) ?? [];
          values.push(subject);
          destinations.set(origin, values);
        }
      }
    }
    for (let index = 0; index < pending.length; index += 1) {
      const { subject, shape } = pending[index]!;
      current = subject;
      budget.reserve(1);
      const previous = demands.get(subject);
      if (previous !== undefined) {
        if (!targetTypeRefEquals(previous.targetType, shape.targetType) || !csharpObjectShapesEqual(previous, shape)) {
          issue(subject, `One source producer requires incompatible native construction carriers '${targetTypeRefKey(previous.targetType)}' and '${targetTypeRefKey(shape.targetType)}'.`);
        }
        continue;
      }
      const selected = selectedType(subject, true);
      if (selected === undefined) continue;
      const key = targetTypeRefKey(shape.targetType);
      const properties = selected.queries.types.propertyInfos(selected.type);
      budget.reserve(properties.length + 1);
      const sourceShape = shapeForType(selected.type, selected.queries);
      const empty = properties.length === 0 &&
        (sourceShape === undefined || !targetTypeRefEquals(sourceShape.targetType, shape.targetType));
      const choices = (empty ? emptyCompatibility.get(subject) : compatibility.get(selected.type)) ??
        new WeakMap<CsharpObjectShapeFact, boolean>();
      let matches = choices.get(shape);
      if (matches === undefined) {
        budget.reserve(1);
        matches = empty ? emptyOriginsMatch(subject, selected, shape)
          : csharpNativeConstructionMembersMatch(selected.type, sourceShape, shape, selected.queries, host, budget.reserve);
        choices.set(shape, matches);
        if (empty) emptyCompatibility.set(subject, choices);
        else compatibility.set(selected.type, choices);
      }
      if (!matches) {
        issue(subject, `A source producer cannot retain all exact fields, absence and native storage in '${key}' without a copied or adapted object.`);
        continue;
      }
      demands.set(subject, shape);
      const incoming = storage.incomingFor(subject);
      if (incoming.kind !== "resolved") {
        issue(subject, incoming.reason);
        continue;
      }
      for (const related of [...incoming.subjects, ...(destinations.get(subject) ?? [])]) {
        budget.reserve(1);
        pending.push({ subject: related, shape });
      }
    }
    for (const node of storage.nodes) {
      budget.reserve(1);
      const selected = storage.subjectFor(node);
      if (selected.kind !== "resolved" || selected.subject.projection.length !== 0) continue;
      current = selected.subject;
      const shape = demands.get(selected.subject);
      if (shape === undefined) continue;
      const source = types.get(selected.subject);
      const nullable = source?.nullable === true;
      const targetType = nullable ? csharpNullableTargetType(shape.targetType) : shape.targetType;
      const existing = host.scopedTargetType(node);
      if (existing !== undefined && !targetTypeRefEquals(existing, targetType)) {
        const original = source === undefined ? undefined : shapeForType(source.type, source.queries);
        const originalTarget = original === undefined ? undefined
          : source?.nullable ? csharpNullableTargetType(original.targetType) : original.targetType;
        if (originalTarget === undefined || !targetTypeRefEquals(existing, originalTarget)) {
          issue(selected.subject, "Native construction demand conflicts with an exact selected source storage carrier.");
          continue;
        }
      }
      budget.reserve(1);
      const retained = source === undefined ? undefined : host.retainSourceShape(node, source.type, shape, source.queries.sourceFile);
      if (retained === undefined) {
        issue(selected.subject, "Native construction has no exact source-member correspondence for its selected storage.");
        continue;
      }
      const choices = constructions.get(retained) ?? new Map<boolean, CsharpNativeConstructionSelection>();
      let construction = choices.get(nullable);
      if (construction === undefined) {
        budget.reserve(1);
        construction = Object.freeze({ targetType, shape: retained });
        choices.set(nullable, construction);
        constructions.set(retained, choices);
      }
      nodeConstructions.set(node, construction);
    }
    const failure = storage.failureReason();
    if (failure !== undefined && current !== undefined) issue(current, failure);
  } catch (error) {
    if (!(error instanceof TypeError) || error.message !== "C# immutable metadata exceeds its finite resource budget." ||
      current === undefined) throw error;
    issues.push(Object.freeze({ node: current.node, code: "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
      message: "Native construction demand exceeds its finite target metadata budget." }));
  }
  return Object.freeze({
    issues: Object.freeze(issues),
    constructionFor(node: Node): CsharpNativeConstructionSelection | undefined {
      return issues.length === 0 ? nodeConstructions.get(node) : undefined;
    },
  });
}
