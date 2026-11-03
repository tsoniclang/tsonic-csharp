import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpCollectedObjectShapeMembers } from "./member-source.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";
import { formAuthoredAndSelectedSourceType,
  type CsharpAuthoredTypeSelectionEvidence } from "../../source-evidence/types/resolution/selected-values.js";
import { projectClassIsObjectInitializable, typeHasProjectOwnedShapeDeclaration } from "./source-evidence.js";
import { formCollectedObjectShapeSource, type CsharpObjectShapeSource } from "./shape-source.js";

export interface CsharpProjectConstructionSource {
  readonly contextNode: Node;
  readonly sourceFile: SourceFile;
  readonly selection: CsharpAuthoredTypeSelectionEvidence;
  readonly projectOwned: boolean;
  readonly initializable: boolean;
  readonly members: CsharpStructuralTypeSource | undefined;
  readonly shape: CsharpObjectShapeSource | undefined;
}

export function formCsharpProjectConstructionSource(
  host: CsharpObjectShapePolicyHost,
  collectMembers: (type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState) =>
    CsharpCollectedObjectShapeMembers | undefined,
  explicitTypeNode: Node | undefined,
  selectedType: Type,
  contextNode: Node,
  sourceFile: SourceFile,
): CsharpProjectConstructionSource {
  const queries = host.semantics(sourceFile);
  const collection = collectMembers(selectedType, queries, Object.freeze({ depth: 0 }));
  return Object.freeze({ contextNode, sourceFile,
    selection: formAuthoredAndSelectedSourceType({ host }, explicitTypeNode, sourceFile,
      selectedType, sourceFile, Object.freeze({ depth: 0 })),
    projectOwned: typeHasProjectOwnedShapeDeclaration(selectedType, contextNode, queries, host),
    initializable: projectClassIsObjectInitializable(selectedType, queries, host),
    members: collection === undefined ? undefined : host.structuralTypeApplication(collection),
    shape: collection === undefined ? undefined : formCollectedObjectShapeSource(collection),
  });
}
