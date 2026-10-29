import { createCsharpNativeParticipationProducer } from "../../program/records/native/native-participation.js";
import type { AstReader, Node } from "@tsonic/tsts";
import { sourceEnclosingCallable, sourceLexicalFunctionIsUnused, sourceNodesOutsideErasedSubtrees } from "@tsonic/target-api/source";
import { rejectedTargetStage, resolvedTargetStage, type TargetStageResult } from "@tsonic/target-api/artifacts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpCaptureStorage } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpNativeParticipation, CsharpNativeParticipationInput } from "../../../target-model/records/native/native-demand.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import type { CsharpObjectShapeClassifications } from "../../../target-model/records/objects/object-shapes.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../../program/records/objects/required-records.js";
import { isCsharpSourceCallableArtifactDeclaration } from "../../../policy/types/callables/source-callable-contract.js";

export interface CsharpNativeParticipationAnalysisInput {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly navigation: Pick<SourceProgramNavigation, "declarationUseSummary" | "declarationSymbol" |
    "sourceReferenceFor" | "callableImplementation" | "referencesWithin">;
  readonly captureClosure: CsharpCaptureStorage["captureClosure"];
  readonly lambdaCreation: CsharpCaptureStorage["lambdaCreation"];
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveNode">;
  readonly compileTimeMetadata: CsharpSourceEvidenceIndex["compileTimeMetadata"];
  readonly requiredRecords: CsharpRequiredRecord[];
}

export function analyzeCsharpNativeParticipation(input: CsharpNativeParticipationAnalysisInput): TargetStageResult<CsharpNativeParticipationInput> {
  const { ast } = input;
  const producer = createCsharpNativeParticipationProducer();
  const admitted = sourceNodesOutsideErasedSubtrees(ast, input.nodes, node => {
      if (input.compileTimeMetadata.get(node)) return true;
      const selected = select(node);
      if (selected === undefined) return false;
      requireCsharpRecord(input.requiredRecords, { family: "nativeParticipation", subject: node,
        construct: "native participation decision", producer: "analyzeCsharpNativeParticipation" });
      producer.selected(node, selected);
      return selected === "erased";
    });
  if (admitted.kind === "unresolved") return rejectedTargetStage([{
    code: "CSHARP_NATIVE_PARTICIPATION_NOT_CLOSED", category: "error", source: "tsonic-csharp", message: admitted.reason,
    evidence: Object.freeze(["target.capability=csharp.native-participation"]),
  }]);
  return resolvedTargetStage(producer.seal());

  function select(node: Node): CsharpNativeParticipation | undefined {
    if (ast.is.IsModuleDeclaration(node)) return "erased";
    if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) {
      return input.lambdaCreation.get(node).kind === "discarded" ? "erased" : "body";
    }
    if (ast.is.IsFunctionDeclaration(node)) {
      if (ast.body(node) === undefined) return "erased";
      if (sourceEnclosingCallable(ast.parent(node), ast) === undefined) return "body";
      if (sourceLexicalFunctionIsUnused(node, ast, input.navigation)) return "erased";
      if (input.captureClosure.get(node) !== undefined) return "frame-body";
      return "body";
    }
    if (ast.is.IsMethodDeclaration(node)) {
      return ast.body(node) !== undefined ? "body" : ast.hasModifierKind(node, "abstract") ? "signature" : "erased";
    }
    if (ast.is.IsConstructorDeclaration(node)) return ast.body(node) === undefined ? "erased" : "body";
    if (ast.is.IsGetAccessorDeclaration(node) || ast.is.IsSetAccessorDeclaration(node)) {
      return ast.hasModifierKind(node, "abstract") ? "signature" : "body";
    }
    if (ast.is.IsMethodSignatureDeclaration(node)) {
      const declaringType = ast.parent(node);
      if (declaringType === undefined || !isCsharpSourceCallableArtifactDeclaration(ast, node)) return "erased";
      if (ast.is.IsInterfaceDeclaration(declaringType)) {
        const owner = ast.parent(declaringType);
        if (owner === undefined || !ast.is.IsSourceFile(owner)) return "erased";
      }
      const shape = input.objectShapes.resolveNode(declaringType, ast.getSourceFile(node));
      const selected = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape, [node]);
      return selected?.kind === "resolved" && selected.member.optional === true ? "erased" : "signature";
    }
    if (ast.is.IsCallSignatureDeclaration(node) || ast.is.IsConstructSignatureDeclaration(node) ||
      ast.is.IsFunctionTypeNode(node) || ast.is.IsConstructorTypeNode(node)) return "erased";
    return undefined;
  }
}
