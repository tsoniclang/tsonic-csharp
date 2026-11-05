import { providerVirtualDeclarationFactKey, type Node, type SourceFile, type Type } from "@tsonic/tsts";
import { sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
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
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { selectCsharpHostLiteralCorrespondence } from "./shapes/host-correspondence.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";

interface CsharpNativeConstructionHost extends Pick<CsharpTypePolicyBaseHost,
  "ast" | "navigation" | "providers" | "sourceFacts" | "sourceFiles" | "semanticsFor" | "effectiveTypes" | "target" | "typeDefinitions"> {
  readonly projectTypes: CsharpProjectTypePolicy;
  resolveEffectiveShape(node: Node, file: SourceFile): CsharpObjectShapeFact | undefined;
  resolveShape(type: Type, file: SourceFile, authoredTypeRoot?: Node): CsharpObjectShapeFact | undefined;
  resolveLiteralShape(shape: CsharpObjectShapeFact, node: Node, file: SourceFile): CsharpObjectLiteralTargetShapeResolution;
  retainSourceShape(node: Node, type: Type, shape: CsharpObjectShapeFact, file: SourceFile): CsharpObjectShapeFact | undefined;
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
  const publish = (node: Node, shape: CsharpObjectShapeFact, hostProven = false): void => {
    const queries = host.semanticsFor(node);
    const source = queries.types.expressionType(node);
    const members = source === undefined ? [] : queries.types.isUnion(source)
      ? queries.types.unionOrIntersectionTypes(source).filter(type => !queries.types.isNullish(type)) : [source];
    if (members.length !== 1) return;
    const existing = host.scopedTargetType(node);
    if (existing !== undefined && !targetTypeRefEquals(existing, shape.targetType)) {
      const original = host.resolveShape(members[0]!, queries.sourceFile, node);
      const conversion = selectCsharpConversion(host, shape.targetType, existing, "implicit");
      if ((original === undefined || !targetTypeRefEquals(existing, original.targetType)) &&
        !(host.ast.is.IsObjectLiteralExpression(node) && conversion.kind === "implicit" && conversion.proof === "reference")) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "Native construction conflicts with an exact selected source storage carrier.");
        return;
      }
    }
    // A Host-proven correspondence retains the descriptor shape itself; no raw member evidence is re-derived.
    const retained = hostProven ? shape : host.retainSourceShape(node, members[0]!, shape, queries.sourceFile);
    if (retained === undefined) {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        "Native construction has no exact source-member correspondence for its declared storage.");
      return;
    }
    const effective = host.effectiveTypes.get(node);
    if (effective === undefined || effective.kind === "refused") return;
    const optional = effective.type.kind === "optional";
    const targetType = optional ? csharpNullableTargetType(retained.targetType) : retained.targetType;
    constructions.set(node, Object.freeze({ targetType, shape: retained }));
  };
  const select = (node: Node): void => {
    if (!host.navigation.isProjectDeclaration(node)) return;
    const queries = host.semanticsFor(node);
    const source = queries.types.expressionType(node);
    if (source === undefined || queries.types.constructSignatures(source).length !== 0) return;
    const effective = host.effectiveTypes.get(node);
    if (effective === undefined || effective.kind === "refused") return;
    let descriptor = effective.type;
    while (descriptor.kind === "optional") descriptor = descriptor.value;
    const subjects = descriptor.kind === "declared" ? [descriptor.declaration] : [];
    if (descriptor.kind === "intrinsic" && descriptor.intrinsic === "any") {
      issue(node, "TSONIC_ANY_UNSUPPORTED", "'any' has no native representation. Declare the type, or use 'unknown' and narrow it.");
      return;
    }
    const expected = host.resolveEffectiveShape(node, queries.sourceFile);
    if (expected === undefined) return;
    const declaration = host.ast.parent(node);
    const variable = declaration === undefined || !host.ast.is.IsVariableDeclaration(declaration)
      ? undefined : host.ast.as.AsVariableDeclaration(declaration);
    const storage = declaration === undefined ? undefined : host.effectiveTypes.get(declaration);
    let storageType = storage?.kind === "refused" ? undefined : storage?.type;
    while (storageType?.kind === "optional") storageType = storageType.value;
    const broadStorage = storageType?.kind === "intrinsic" && (storageType.intrinsic === "object" || storageType.intrinsic === "unknown");
    const declarations = variable?.Initializer === node && !broadStorage ? [declaration!] : [];
    const retain = (shape: CsharpObjectShapeFact, hostProven = false): void => {
      publish(node, shape, hostProven);
      for (const declaration of declarations) {
        publish(declaration, shape, hostProven);
        for (const reference of host.navigation.referencesToDeclaration(declaration)) publish(reference, shape, hostProven);
      }
    };
    const native = subjects.some(subject => {
      const fact = host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
      if (fact === undefined) return false;
      const provider = host.providers.resolveType(fact);
      return provider.kind === "resolved" && provider.relations.some(relation =>
        relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer");
    });
    // Native provider constructions keep their provider proof below.
    const correspondence = native ? undefined : selectCsharpHostLiteralCorrespondence(host.ast, node, effective, expected, host.publishedShapeTarget(node));
    if (correspondence?.kind === "rejected") {
      issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", correspondence.reason);
      return;
    }
    if (correspondence?.kind === "proven") {
      retain(expected, true);
      if (variable?.Initializer === node && effective.kind === "default") selectLocalValue(declaration!, source, node);
      return;
    }
    if (native) {
      const original = host.resolveShape(source, queries.sourceFile, node);
      const budget = createCsharpMetadataBudget();
      let compatible = false;
      try {
        compatible = csharpNativeConstructionMembersMatch(source, original, expected, queries, host, budget.reserve);
      } catch (error) {
        if (!(error instanceof CsharpMetadataResourceLimitFailure)) throw error;
        issue(node, "TSONIC_COMPILER_RESOURCE_LIMIT",
          `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`);
        return;
      }
      if (!compatible) {
        issue(node, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
          "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.");
        return;
      }
      retain(expected);
      return;
    }
    const resolved = host.resolveLiteralShape(expected, node, queries.sourceFile);
    if (resolved.kind === "rejected") {
      issue(resolved.subject, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", resolved.reason);
      return;
    }
    if (resolved.kind === "resolved") retain(resolved.shape);
    if (variable?.Initializer === node && effective.kind === "default") selectLocalValue(declaration!, source, node);
  };
  const selectLocalValue = (declaration: Node, source: Type, expression?: Node): void => {
    if (sourceDeclarationIsModuleScoped(declaration, host.ast)) return;
    const queries = host.semanticsFor(declaration);
    const summary = host.navigation.declarationUseSummary(declaration);
    if (summary.bindingWritten || summary.memberWritten || summary.identityCompared || summary.aliasedOrStored ||
      summary.exported || summary.hasUnclassifiedValueUse || summary.conditionallyRead ||
      summary.escapeKinds.some(kind => kind !== "capture") || summary.uses.length === 0 ||
      summary.uses.some(use => use.kind !== "type-only" && (use.role !== "receiver" || !use.throughMember))) return;
    const original = host.resolveShape(source, queries.sourceFile, expression ?? declaration);
    const existing = host.scopedTargetType(declaration);
    if (original === undefined || existing !== undefined && !targetTypeRefEquals(existing, original.targetType)) return;
    const shape = createCsharpObjectShapeValueStorage(original);
    if (shape === undefined) return;
    if (expression !== undefined) publish(expression, shape);
    publish(declaration, shape);
    for (const reference of host.navigation.referencesToDeclaration(declaration)) publish(reference, shape);
  };
  const visit = (node: Node): void => {
    host.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    if (host.ast.is.IsObjectLiteralExpression(node)) select(node);
    if (host.ast.is.IsBindingElement(node) && host.ast.as.AsBindingElement(node)?.DotDotDotToken !== undefined &&
      host.ast.is.IsObjectBindingPattern(host.ast.parent(node)) && host.navigation.isProjectDeclaration(node)) {
      const source = host.semanticsFor(node).types.expressionType(node);
      if (source !== undefined) selectLocalValue(node, source);
    }
  };
  for (const sourceFile of host.sourceFiles) visit(sourceFile);
  return createCsharpNativeConstructionRecords(constructions, issues);
}
