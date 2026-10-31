import type { CsharpClassCapture, CsharpClassFactory, CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { Node } from "@tsonic/tsts";
import { sourceLexicalCaptures, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog } from "../../target-model/records/types/project-types.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpStorageClassifications, CsharpStorageIssue } from "../../target-model/records/storage/storage.js";

import { getCsharpClassFactory } from "../../target-model/types/carriers/class-factories.js";
import type { CsharpSourceNameResolver } from "../names/plan.js";
import { csharpTargetNamedType } from "../../target-model/types/factories.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/objects/required-records.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import { readCsharpSelectedWritingReference } from "../callables/values/argument-passing.js";

export function analyzeCsharpClassFactories(
  source: TargetSourceProgram,
  catalog: CsharpProjectTypeCatalog,
  evidence: CsharpSourceEvidenceIndex,
  storage: Pick<CsharpStorageClassifications, "storageType">,
  names: CsharpSourceNameResolver,
  selectedCalls: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">,
  requiredRecords: CsharpRequiredRecord[],
): CsharpClassFactoryIndex {
  const factories: CsharpClassFactory[] = [];
  const issues: CsharpStorageIssue[] = [];
  for (const definition of catalog.definitions) {
    if (!definition.local) continue;
    const declaration = definition.declaration;
    requireCsharpRecord(requiredRecords, { family: "classFactory", subject: declaration,
      construct: "local class definition", producer: "analyzeCsharpClassFactories" });
    const type = evidence.classConstructorType.get(declaration);
    const contract = getCsharpClassFactory(type);
    const selected = sourceLexicalCaptures(declaration, [declaration], source.ast, source.navigation, "source");
    const captures = selected.captures.map((capture, index): CsharpClassCapture | undefined => {
      const reference = capture.references[0];
      const type = storage.storageType.get(capture.declaration) ?? evidence.storageTargetType.get(capture.declaration) ??
        (reference === undefined ? undefined : evidence.nodeTargetType.get(reference));
      return reference === undefined || type === undefined ? undefined : Object.freeze({
        declaration: capture.declaration, reference, type, fieldName: names.temporaryName(`capture${index}`),
        mutable: source.navigation.declarationUseSummary(capture.declaration).bindingWritten ||
          source.navigation.declarationUseSummary(capture.declaration).uses.some(use =>
            readCsharpSelectedWritingReference(source, evidence, selectedCalls, use.reference) !== undefined),
      });
    });
    if (contract === undefined || type?.kind !== "target-named" || definition.scopeName === undefined ||
      captures.some(capture => capture === undefined) || selected.receivers.length !== 0) {
      issues.push({ node: declaration, code: "CSHARP_CLASS_FACTORY_NOT_CLOSED",
        message: `A local class requires an exact native contract. Unresolved: ${[
          ...(contract === undefined ? ["constructor signature and instance identity"] : []),
          ...(definition.scopeName === undefined ? ["local declaration scope"] : []),
          ...(captures.some(capture => capture === undefined) ? ["lexical capture storage"] : []),
          ...(selected.receivers.length !== 0 ? ["outer receiver lifetime"] : []),
        ].join(", ")}.` });
      continue;
    }
    const hasInstanceCaptures = selected.captures.flatMap(capture => capture.references).some(reference => {
      for (let owner = source.ast.parent(reference); owner !== undefined && owner !== declaration; owner = source.ast.parent(owner)) {
        if (source.ast.is.IsMethodDeclaration(owner) || source.ast.is.IsGetAccessorDeclaration(owner) || source.ast.is.IsSetAccessorDeclaration(owner)) {
          return source.ast.parent(owner) === declaration && !source.ast.hasModifierKind(owner, "static");
        }
        if (source.ast.is.IsPropertyDeclaration(owner) || source.ast.is.IsConstructorDeclaration(owner)) return false;
      }
      return false;
    });
    factories.push(Object.freeze({ declaration, sourceFile: definition.sourceFile,
      instanceName: definition.sourceName, instanceScope: definition.scopeName,
      factoryName: definition.factoryName!, factoryType: type,
      environmentName: names.temporaryName("environment"),
      contract, captures: Object.freeze(captures as CsharpClassCapture[]), hasInstanceCaptures,
      ...(definition.sourceTypeParameterCount > 0 ? { identity: Object.freeze({
        name: definition.factoryIdentityName!,
        type: csharpTargetNamedType(`${definition.id}:factory-identity`, type.typeArguments, { kind: "named", name: definition.factoryIdentityName! }, { allowsRefLikeTypeArguments: (type.typeArguments ?? []).map(() => false),}),
      }) } : {}),
    }));
  }
  const byDeclaration = new Map(factories.map(factory => [factory.declaration, factory]));
  return Object.freeze({ factories: Object.freeze(factories), issues: Object.freeze(issues),
    classFactory: Object.freeze({ get: (declaration: Node) => byDeclaration.get(declaration) }) });
}
