import type { AstReader, Node } from "@tsonic/tsts";
import { sourceEnclosingCallable, sourceLexicalFunctionIsUnused } from "@tsonic/target-api/source";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpNativeParticipation, CsharpNativeParticipationInput } from "../../target-model/records/native-demand.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import type { CsharpObjectShapeClassifications } from "../objects/model.js";

export interface CsharpNativeParticipationAnalysisInput {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly navigation: Pick<SourceProgramNavigation, "declarationUseSummary">;
  readonly captureClosure: CsharpCaptureStorage["captureClosure"];
  readonly lambdaCreation: CsharpCaptureStorage["lambdaCreation"];
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveNode">;
  readonly compileTimeMetadata: CsharpSourceEvidenceIndex["compileTimeMetadata"];
}

export function analyzeCsharpNativeParticipation(input: CsharpNativeParticipationAnalysisInput): CsharpNativeParticipationInput {
  const { ast } = input;
  const participation = new WeakMap<Node, CsharpNativeParticipation>();
  const excluded = new WeakSet<Node>();
  for (const node of input.nodes) {
    const parent = ast.parent(node);
    if (parent !== undefined && excluded.has(parent) || input.compileTimeMetadata.get(node)) {
      excluded.add(node);
      continue;
    }
    const selected = select(node);
    if (selected === undefined) continue;
    participation.set(node, selected);
    if (selected === "erased") excluded.add(node);
  }
  return Object.freeze({ participation: Object.freeze({ get: (declaration: Node) => participation.get(declaration) }) });

  function select(node: Node): CsharpNativeParticipation | undefined {
    if (ast.is.IsModuleDeclaration(node)) return "erased";
    if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) {
      return input.lambdaCreation.get(node).kind === "discarded" ? "erased" : "body";
    }
    if (ast.is.IsFunctionDeclaration(node)) {
      if (ast.body(node) === undefined) return "erased";
      if (sourceEnclosingCallable(ast.parent(node), ast) === undefined) return "body";
      if (input.captureClosure.get(node) !== undefined) return "frame-body";
      return sourceLexicalFunctionIsUnused(node, ast, input.navigation) ? "erased" : "body";
    }
    if (ast.is.IsMethodDeclaration(node)) {
      return ast.body(node) !== undefined ? "body" : ast.hasModifierKind(node, "abstract") ? "signature" : "erased";
    }
    if (ast.is.IsConstructorDeclaration(node)) return ast.body(node) === undefined ? "erased" : "body";
    if (ast.is.IsGetAccessorDeclaration(node) || ast.is.IsSetAccessorDeclaration(node)) {
      return ast.hasModifierKind(node, "abstract") ? "signature" : "body";
    }
    if (ast.is.IsMethodSignatureDeclaration(node)) {
      const declaringInterface = ast.parent(node);
      const owner = declaringInterface === undefined ? undefined : ast.parent(declaringInterface);
      if (declaringInterface === undefined || !ast.is.IsInterfaceDeclaration(declaringInterface) ||
        owner === undefined || !ast.is.IsSourceFile(owner)) return "erased";
      const shape = input.objectShapes.resolveNode(declaringInterface, ast.getSourceFile(node));
      const selected = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape, [node]);
      return selected?.kind === "resolved" && selected.member.optional === true ? "erased" : "signature";
    }
    if (ast.is.IsCallSignatureDeclaration(node) || ast.is.IsConstructSignatureDeclaration(node) ||
      ast.is.IsFunctionTypeNode(node) || ast.is.IsConstructorTypeNode(node)) return "erased";
    return undefined;
  }
}
