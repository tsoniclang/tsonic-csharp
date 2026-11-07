import { providerVirtualDeclarationFactKey, type Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceTypeOutcome } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceSlot } from "../program/source-facts.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { CsharpMetadataResourceLimitFailure, createCsharpMetadataBudget, maximumCsharpMetadataEntries } from "../../target-model/metadata/immutable.js";
import type { CsharpTypeSystemHost } from "../program/type-system.js";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import { csharpObjectShapesEqual } from "../../target-model/types/object-shape-equality.js";
import { createCsharpObjectShapeValueStorage } from "../../policy/types/objects/shape-carriers.js";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue,
  CsharpNativeConstructionSelection } from "../../target-model/records/native/native-construction.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../target-model/records/objects/object-shapes.js";
import { createCsharpNativeConstructionRecords } from "../program/records/native/native-construction.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { selectCsharpHostLiteralCorrespondence } from "./shapes/host-correspondence.js";
import { csharpProviderObjectLiteralIndexerFailure } from "./shapes/provider-construction.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";

interface CsharpNativeConstructionHost extends Pick<CsharpTypeSystemHost,
  "ast" | "facts" | "providers" | "sourceFacts" | "sourceFiles" | "target" | "typeDefinitions"> {
  readonly types: CsharpTypeQueries;
  readonly projectTypes: CsharpProjectTypePolicy;
  resolveEffectiveShape(node: Node): CsharpObjectShapeFact | undefined;
  resolveLiteralShape(shape: CsharpObjectShapeFact, node: Node): CsharpObjectLiteralTargetShapeResolution;
  retainSourceShape(node: Node, shape: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined;
  publishedShapeTarget(node: Node): TargetTypeRef | undefined;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
}

export function createCsharpNativeConstructionDemandQuery(
  host: CsharpNativeConstructionHost,
): CsharpNativeConstructionDemandQueries {
  const constructions = new Map<Node, CsharpNativeConstructionSelection>();
  const issues: CsharpNativeConstructionIssue[] = [];
  const issue = (node: Node, code: CsharpNativeConstructionIssue["code"], message: string): void => {
    issues.push(Object.freeze({ node, code, message }));
  };
  // Host refusals are forwarded before C# analysis; a refused value outcome here is a producer defect (I4).
  const outcome = (node: Node): Exclude<SourceTypeOutcome, { readonly kind: "refused" }> => {
    const effective = host.facts.values.type(node);
    return effective.kind === "refused" ? failTargetAnalysisInvariant("tsonic-csharp",
      "A value type is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", node) : effective;
  };
  const publish = (node: Node, shape: CsharpObjectShapeFact, hostProven = false): void => {
    const effective = outcome(node);
    if (effective.provenance.occurrence !== node) return;
    let descriptor = sourceTypeDescriptorStructure(effective.construction ?? effective.type);
    while (descriptor.kind === "optional") descriptor = sourceTypeDescriptorStructure(descriptor.value);
    const members = descriptor.kind === "union" ? descriptor.types.map(sourceTypeDescriptorStructure)
      .filter(type => type.kind !== "intrinsic" || type.intrinsic !== "absence") : [descriptor];
    if (members.length !== 1) return;
    const existing = host.scopedTargetType(node);
    if (existing !== undefined && !targetTypeRefEquals(existing, shape.targetType)) {
      const original = hostProven ? undefined : host.resolveEffectiveShape(node);
      const conversion = selectCsharpConversion(host, shape.targetType, existing, "implicit");
      if ((original === undefined || !targetTypeRefEquals(existing, original.targetType)) &&
        !(host.ast.is.IsObjectLiteralExpression(node) && conversion.kind === "implicit" && conversion.proof === "reference")) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "Native construction conflicts with an exact selected source storage carrier.");
        return;
      }
    }
    const retainedOccurrence = hostProven && !host.ast.is.IsObjectLiteralExpression(node);
    const published = retainedOccurrence ? host.publishedShapeTarget(node) : undefined;
    if (retainedOccurrence && (published === undefined ||
      !targetTypeRefEquals(getCsharpNullableElementTargetType(published) ?? published, shape.targetType))) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        "Native construction has no exact source-member correspondence for its current published target.");
      return;
    }
    const retained = hostProven && !retainedOccurrence ? shape
      : host.retainSourceShape(node, shape);
    if (retained === undefined || hostProven && !csharpObjectShapesEqual(shape, retained)) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        "Native construction has no exact source-member correspondence for its declared storage.");
      return;
    }
    const optional = effective.type.kind === "optional";
    const targetType = optional ? csharpNullableTargetType(retained.targetType) : retained.targetType;
    constructions.set(node, Object.freeze({ targetType, shape: hostProven ? shape : retained }));
  };
  const select = (node: Node): void => {
    if (!host.facts.navigation.identity.isProjectDeclaration(node)) return;
    const effective = outcome(node);
    let descriptor = effective.type;
    while (descriptor.kind === "optional") descriptor = descriptor.value;
    const structure = sourceTypeDescriptorStructure(descriptor);
    if ((structure.kind === "shape" || structure.kind === "callable") && structure.constructs.length !== 0) return;
    const subjects = descriptor.kind === "declared" ? [descriptor.declaration] : [];
    // An object literal typed `any` is a Host value refusal (request R-F5-A2); C# never originates it.
    if (descriptor.kind === "intrinsic" && descriptor.intrinsic === "any") failTargetAnalysisInvariant("tsonic-csharp",
      "An object literal of type any must be refused by the Host before C# analysis.", node);
    const native = subjects.some(subject => {
      const fact = host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
      if (fact === undefined) return false;
      const provider = host.providers.resolveType(fact);
      return provider.kind === "resolved" && provider.relations.some(relation =>
        relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer");
    });
    const nativeFailure = "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.";
    const indexerFailure = native ? csharpProviderObjectLiteralIndexerFailure(descriptor, node, host) : undefined;
    if (indexerFailure !== undefined) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", indexerFailure);
      return;
    }
    const expected = host.resolveEffectiveShape(node);
    if (expected === undefined) {
      if (native) issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", nativeFailure);
      return;
    }
    const declaration = host.ast.parent(node);
    const variable = declaration === undefined || !host.ast.is.IsVariableDeclaration(declaration)
      ? undefined : host.ast.as.AsVariableDeclaration(declaration);
    let storageType = variable === undefined ? undefined : sourceSlot(host.facts, declaration!).type;
    while (storageType?.kind === "optional") storageType = storageType.value;
    const broadStorage = storageType?.kind === "intrinsic" && (storageType.intrinsic === "object" || storageType.intrinsic === "unknown");
    const declarations = variable?.Initializer === node && !broadStorage ? [declaration!] : [];
    const retain = (shape: CsharpObjectShapeFact, hostProven = false): void => {
      publish(node, shape, hostProven);
      for (const declaration of declarations) {
        publish(declaration, shape, hostProven);
        for (const reference of host.facts.navigation.uses.references(declaration)) publish(reference, shape, hostProven);
      }
    };
    let correspondence: ReturnType<typeof selectCsharpHostLiteralCorrespondence>;
    try {
      if (native) {
        const budget = createCsharpMetadataBudget();
        const properties = host.ast.properties(node);
        budget.reserve(expected.members.length + properties.length);
        let origins = 0;
        for (const member of expected.members) {
          const count = member.origins?.length ?? 0;
          budget.reserve(count);
          origins += count;
        }
        const selected = effective.memberCorrespondence?.length ?? 0;
        budget.reserve(2 * (selected * (expected.members.length + origins) + expected.members.length * origins));
      }
      correspondence = selectCsharpHostLiteralCorrespondence(host.ast, node, effective, expected, host.publishedShapeTarget(node));
    } catch (error) {
      if (!(error instanceof CsharpMetadataResourceLimitFailure)) throw error;
      issue(node, "TSONIC_COMPILER_RESOURCE_LIMIT",
        `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`);
      return;
    }
    if (correspondence?.kind === "rejected") {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", correspondence.reason);
      return;
    }
    if (correspondence.kind === "proven") {
      if (native) {
        const resolved = host.resolveLiteralShape(expected, node);
        if (resolved.kind !== "resolved" || !csharpObjectShapesEqual(expected, resolved.shape) ||
          selectCsharpHostLiteralCorrespondence(host.ast, node, effective, resolved.shape,
            host.publishedShapeTarget(node)).kind !== "proven") {
          issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", resolved.kind === "rejected" ? resolved.reason : nativeFailure);
          return;
        }
        retain(resolved.shape, true);
      } else retain(expected, true);
      if (variable?.Initializer === node && effective.kind === "default") selectLocalValue(declaration!, node);
      return;
    }
    if (native) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", nativeFailure);
      return;
    }
    const resolved = host.resolveLiteralShape(expected, node);
    if (resolved.kind === "rejected") {
      issue(resolved.subject, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", resolved.reason);
      return;
    }
    if (resolved.kind === "resolved") retain(resolved.shape);
    if (variable?.Initializer === node && effective.kind === "default") selectLocalValue(declaration!, node);
  };
  const selectLocalValue = (declaration: Node, expression?: Node): void => {
    if (host.facts.navigation.scopes.isModuleScoped(declaration)) return;
    const summary = host.facts.navigation.uses.summary(declaration);
    if (summary.bindingWritten || summary.memberWritten || summary.identityCompared || summary.aliasedOrStored ||
      summary.exported || summary.hasUnclassifiedValueUse || summary.conditionallyRead ||
      summary.escapeKinds.some(kind => kind !== "capture") || summary.uses.length === 0 ||
      summary.uses.some(use => use.kind !== "type-only" && (use.role !== "receiver" || !use.throughMember))) return;
    const original = host.resolveEffectiveShape(expression ?? declaration);
    const existing = host.scopedTargetType(declaration);
    if (original === undefined || existing !== undefined && !targetTypeRefEquals(existing, original.targetType)) return;
    const shape = createCsharpObjectShapeValueStorage(original);
    if (shape === undefined) return;
    if (expression !== undefined) publish(expression, shape);
    publish(declaration, shape);
    for (const reference of host.facts.navigation.uses.references(declaration)) publish(reference, shape);
  };
  const visit = (node: Node): void => {
    host.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    if (host.ast.is.IsObjectLiteralExpression(node)) select(node);
    if (host.ast.is.IsBindingElement(node) && host.ast.as.AsBindingElement(node)?.DotDotDotToken !== undefined &&
      host.ast.is.IsObjectBindingPattern(host.ast.parent(node)) && host.facts.navigation.identity.isProjectDeclaration(node)) {
      selectLocalValue(node);
    }
  };
  for (const sourceFile of host.sourceFiles) visit(sourceFile as unknown as Node);
  return createCsharpNativeConstructionRecords(constructions, issues);
}
