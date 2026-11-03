import { providerVirtualDeclarationFactKey, type Node, type SourceFile, type Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { formCsharpLiteralCreationSource, selectCsharpLiteralCreationContext,
  type CsharpLiteralContext, type CsharpLiteralContextHost } from "./literal-creation-source.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";
import { CsharpMetadataResourceLimitFailure, createCsharpMetadataBudget, maximumCsharpMetadataEntries } from "../../target-model/metadata/immutable.js";
import type { CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import { csharpNativeConstructionMembersMatch } from "./native-construction-members.js";
import { createCsharpObjectShapeValueStorage } from "../../policy/types/objects/shape-carriers.js";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue,
  CsharpNativeConstructionSelection } from "../../target-model/records/native/native-construction.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../target-model/records/objects/object-shapes.js";
import { createCsharpNativeConstructionRecords } from "../program/records/native/native-construction.js";
import type { CsharpLiteralConstructionSource, CsharpLocalConstructionSource,
  CsharpNativeConstructionSource } from "./native-construction-source.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function selectCsharpLiteralDeclarationContext(
  expression: Node,
  queries: SourceFileSemantics,
  host: CsharpLiteralContextHost,
): CsharpLiteralContext | undefined {
  return selectCsharpLiteralCreationContext(formCsharpLiteralCreationSource(expression, queries, host));
}

interface CsharpNativeConstructionHost<ShapeSource extends object> extends Pick<CsharpTypePolicyBaseHost,
  "ast" | "navigation" | "providers" | "sourceFacts" | "sourceFiles" | "semanticsFor"> {
  completeShapeSource(source: ShapeSource): CsharpObjectShapeFact | undefined;
  resolveLiteralShape(shape: CsharpObjectShapeFact, node: Node, file: SourceFile): CsharpObjectLiteralTargetShapeResolution;
  retainSourceShape(node: Node, type: Type, shape: CsharpObjectShapeFact, file: SourceFile): CsharpObjectShapeFact | undefined;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
}

export function csharpUntypedObjectLiteralIssue(node: Node): CsharpNativeConstructionIssue {
  return Object.freeze({ node, code: "TSONIC_UNTYPED_OBJECT_LITERAL",
    message: "This object literal has no target type. Declare one, e.g. 'function baseOptions(): MakeDirectoryOptions'." });
}

export function createCsharpNativeConstructionDemandQuery<ShapeSource extends object>(
  host: CsharpNativeConstructionHost<ShapeSource>,
  sourcePlan: CsharpNativeConstructionSource<ShapeSource>,
): CsharpNativeConstructionDemandQueries {
  if (sourcePlan.input.ast !== host.ast || sourcePlan.input.navigation !== host.navigation ||
    sourcePlan.input.sourceFiles !== host.sourceFiles || sourcePlan.input.semanticsFor !== host.semanticsFor) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Native construction requires its original source program input.");
  }
  const constructions = new Map<Node, CsharpNativeConstructionSelection>();
  const issues: CsharpNativeConstructionIssue[] = [];
  const issue = (node: Node, code: CsharpNativeConstructionIssue["code"], message: string): void => {
    issues.push(Object.freeze({ node, code, message }));
  };
  const publish = (node: Node, shape: CsharpObjectShapeFact): void => {
    const input = sourcePlan.publicationFor(node);
    if (input === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Native construction publication requires its retained checked source input.", node);
    const { queries, type: source, presentTypes: members } = input;
    if (members.length !== 1) return;
    const existing = host.scopedTargetType(node);
    if (existing !== undefined && !targetTypeRefEquals(existing, shape.targetType)) {
      if (input.originalShape === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A construction conflict requires its retained original shape source.", node);
      const original = host.completeShapeSource(input.originalShape);
      if (original === undefined || !targetTypeRefEquals(existing, original.targetType)) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "Native construction conflicts with an exact selected source storage carrier.");
        return;
      }
    }
    const retained = host.retainSourceShape(node, members[0]!, shape, queries.sourceFile);
    if (retained === undefined) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        "Native construction has no exact source-member correspondence for its declared storage.");
      return;
    }
    const targetType = source !== members[0] ? csharpNullableTargetType(retained.targetType) : retained.targetType;
    constructions.set(node, Object.freeze({ targetType, shape: retained }));
  };
  const select = (input: CsharpLiteralConstructionSource<ShapeSource>): void => {
    const { node, queries, type: source, context, selectedType: selected } = input;
    if (input.any) {
      issue(node, "TSONIC_ANY_UNSUPPORTED", "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
      return;
    }
    if (input.untyped) {
      issues.push(csharpUntypedObjectLiteralIssue(node));
      return;
    }
    const native = selected !== undefined && input.selectedSubjects.some(subject => {
      const fact = host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
      if (fact === undefined) return false;
      const provider = host.providers.resolveType(fact);
      return provider.kind === "resolved" && provider.relations.some(relation =>
        relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer");
    });
    if (native && selected !== undefined) {
      const shape = input.expectedShape === undefined ? undefined : host.completeShapeSource(input.expectedShape);
      const original = host.completeShapeSource(input.originalShape);
      const budget = createCsharpMetadataBudget();
      let compatible = false;
      try {
        compatible = shape !== undefined && csharpNativeConstructionMembersMatch(source, original, shape, queries, host, budget.reserve);
      } catch (error) {
        if (!(error instanceof CsharpMetadataResourceLimitFailure)) throw error;
        issue(node, "TSONIC_COMPILER_RESOURCE_LIMIT",
          `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`);
        return;
      }
      if (shape === undefined || !compatible) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.");
        return;
      }
      for (const publication of input.publications) publish(publication.node, shape);
      return;
    }
    if (selected !== undefined && !input.unknown) {
      const expected = input.expectedShape === undefined ? undefined : host.completeShapeSource(input.expectedShape);
      const resolved = expected === undefined ? undefined : host.resolveLiteralShape(expected, node, queries.sourceFile);
      if (resolved?.kind === "rejected") {
        issue(resolved.subject, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", resolved.reason);
        return;
      }
      if (resolved?.kind === "resolved") {
        for (const publication of input.publications) publish(publication.node, resolved.shape);
        return;
      }
    }
    if (context !== undefined) return;
    if (input.local !== undefined) selectLocalValue(input.local);
  };
  const selectLocalValue = (input: CsharpLocalConstructionSource<ShapeSource>): void => {
    const { declaration } = input;
    const original = host.completeShapeSource(input.originalShape);
    const existing = host.scopedTargetType(declaration);
    if (original === undefined || existing !== undefined && !targetTypeRefEquals(existing, original.targetType)) return;
    const shape = createCsharpObjectShapeValueStorage(original);
    if (shape === undefined) return;
    for (const publication of input.publications) publish(publication.node, shape);
  };
  for (const task of sourcePlan.tasks) {
    if (task.kind === "literal") select(task);
    else selectLocalValue(task.source);
  }
  return createCsharpNativeConstructionRecords(constructions, issues);
}
