import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceLexicalCaptures, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog } from "../../policy/types/project/project-types.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";
import type { CsharpStorageClassifications, CsharpStorageIssue } from "../storage/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpClassFactory, type CsharpClassFactoryType } from "../../target-model/types/class-factories.js";
import type { CsharpSourceNameResolver } from "../names/source-names.js";

export interface CsharpClassCapture {
  readonly declaration: Node;
  readonly reference: Node;
  readonly fieldName: string;
  readonly type: TargetTypeRef;
  readonly mutable: boolean;
}

export interface CsharpClassFactory {
  readonly declaration: Node;
  readonly sourceFile: SourceFile;
  readonly instanceName: string;
  readonly factoryName: string;
  readonly factoryType: CsharpTargetNamedTypeRef;
  readonly contract: CsharpClassFactoryType;
  readonly captures: readonly CsharpClassCapture[];
  readonly retainsEnvironment: boolean;
  readonly requiresInstanceTest: boolean;
  readonly environmentName: string;
}

export interface CsharpClassFactoryIndex {
  readonly factories: readonly CsharpClassFactory[];
  readonly issues: readonly CsharpStorageIssue[];
  get(declaration: Node): CsharpClassFactory | undefined;
}

export function analyzeCsharpClassFactories(
  source: TargetSourceProgram,
  catalog: CsharpProjectTypeCatalog,
  evidence: CsharpSourceEvidenceIndex,
  storage: CsharpStorageClassifications,
  names: CsharpSourceNameResolver,
): CsharpClassFactoryIndex {
  const factories: CsharpClassFactory[] = [];
  const issues: CsharpStorageIssue[] = [];
  const identityDemands = new Set<Node>();
  const collectIdentityDemands = (node: Node): void => {
    if (source.ast.is.IsBinaryExpression(node) && source.ast.operatorKindName(node) === "KindInstanceOfKeyword") {
      const right = source.ast.as.AsBinaryExpression(node)?.Right;
      const factory = right === undefined ? undefined : getCsharpClassFactory(evidence.nodeTargetType(right));
      if (factory !== undefined) identityDemands.add(factory.declaration);
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) collectIdentityDemands(child); });
  };
  source.navigation.sourceFiles.forEach(collectIdentityDemands);
  for (const definition of catalog.definitions) {
    if (!definition.local) continue;
    const declaration = definition.declaration;
    const type = evidence.classConstructorType(declaration);
    const contract = getCsharpClassFactory(type);
    const selected = sourceLexicalCaptures(declaration, [declaration], source.ast, source.navigation);
    const captures = selected.captures.map((capture, index): CsharpClassCapture | undefined => {
      const reference = capture.references[0];
      const type = storage.type(capture.declaration) ?? evidence.storageTargetType(capture.declaration) ??
        (reference === undefined ? undefined : evidence.nodeTargetType(reference));
      return reference === undefined || type === undefined ? undefined : Object.freeze({
        declaration: capture.declaration, reference, type, fieldName: names.temporaryName(`capture${index}`),
        mutable: source.navigation.declarationUseSummary(capture.declaration).bindingWritten,
      });
    });
    if (contract === undefined || type?.kind !== "target-named" || captures.some(capture => capture === undefined) || selected.receivers.length !== 0) {
      issues.push({ node: declaration, code: "CSHARP_CLASS_FACTORY_NOT_CLOSED",
        message: `A local class requires an exact native contract. Unresolved: ${[
          ...(contract === undefined ? ["constructor signature and instance identity"] : []),
          ...(captures.some(capture => capture === undefined) ? ["lexical capture storage"] : []),
          ...(selected.receivers.length !== 0 ? ["outer receiver lifetime"] : []),
        ].join(", ")}.` });
      continue;
    }
    const retainedReferences = [...selected.captures.flatMap(capture => capture.references),
      ...source.navigation.declarationUses(declaration).filter(use => use.kind !== "type-only").map(use => use.reference)];
    const requiresInstanceTest = identityDemands.has(declaration);
    const retainsEnvironment = requiresInstanceTest || retainedReferences.some(reference => {
      for (let owner = source.ast.parent(reference); owner !== undefined && owner !== declaration; owner = source.ast.parent(owner)) {
        if (source.ast.is.IsMethodDeclaration(owner) || source.ast.is.IsGetAccessorDeclaration(owner) || source.ast.is.IsSetAccessorDeclaration(owner)) {
          return source.ast.parent(owner) === declaration && !source.ast.hasModifierKind(owner, "static");
        }
        if (source.ast.is.IsPropertyDeclaration(owner) || source.ast.is.IsConstructorDeclaration(owner)) return false;
      }
      return false;
    });
    factories.push(Object.freeze({ declaration, sourceFile: definition.sourceFile,
      instanceName: definition.sourceName, factoryName: definition.factoryName!, factoryType: type,
      environmentName: names.temporaryName("environment"),
      contract, captures: Object.freeze(captures as CsharpClassCapture[]), retainsEnvironment, requiresInstanceTest }));
  }
  const byDeclaration = new Map(factories.map(factory => [factory.declaration, factory]));
  return Object.freeze({ factories: Object.freeze(factories), issues: Object.freeze(issues),
    get: (declaration: Node) => byDeclaration.get(declaration) });
}
