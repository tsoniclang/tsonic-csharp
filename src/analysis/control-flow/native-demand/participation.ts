import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import { sourceEnclosingCallable, sourceLexicalFunctionIsUnused } from "@tsonic/target-api/source";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpCaptureStorage } from "../../../target-model/records/capture-storage.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/source-evidence.js";
import type {
  CsharpNativeParticipation,
  CsharpNativeParticipationClassifications,
} from "../../../target-model/records/native-participation.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/index.js";
import type { CsharpObjectShapeClassifications } from "../../objects/model.js";

export interface CsharpNativeParticipationInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly navigation: Pick<SourceProgramNavigation, "declarationUseSummary">;
  readonly captureClosure: CsharpCaptureStorage["captureClosure"];
  readonly lambdaCreation: CsharpCaptureStorage["lambdaCreation"];
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveNode">;
  readonly compileTimeMetadata: CsharpSourceEvidenceIndex["compileTimeMetadata"];
}

export function analyzeCsharpNativeParticipation(input: CsharpNativeParticipationInput): CsharpNativeParticipationClassifications {
  const { ast } = input;
  const participation = new WeakMap<Node, CsharpNativeParticipation>();
  for (const sourceFile of input.sourceFiles) visit(sourceFile, sourceFile);
  return Object.freeze({
    participation: Object.freeze({ get: (declaration: Node) => participation.get(declaration) }),
  });

  function visit(node: Node, sourceFile: SourceFile): void {
    if (input.compileTimeMetadata.get(node)) return;
    const selected = select(node, sourceFile);
    if (selected !== undefined) participation.set(node, selected);
    if (selected === "erased") return;
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child, sourceFile); });
  }

  function select(node: Node, sourceFile: SourceFile): CsharpNativeParticipation | undefined {
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
    if (ast.is.IsConstructorDeclaration(node) || ast.is.IsGetAccessorDeclaration(node) || ast.is.IsSetAccessorDeclaration(node)) {
      return ast.body(node) !== undefined ? "body" : "erased";
    }
    if (ast.is.IsMethodSignatureDeclaration(node)) return interfaceMethodParticipation(node, sourceFile);
    if (ast.is.IsCallSignatureDeclaration(node) || ast.is.IsConstructSignatureDeclaration(node) ||
      ast.is.IsFunctionTypeNode(node) || ast.is.IsConstructorTypeNode(node)) return "erased";
    return undefined;
  }

  function interfaceMethodParticipation(node: Node, sourceFile: SourceFile): CsharpNativeParticipation {
    const declaringInterface = ast.parent(node);
    const interfaceOwner = declaringInterface === undefined ? undefined : ast.parent(declaringInterface);
    if (declaringInterface === undefined || !ast.is.IsInterfaceDeclaration(declaringInterface) ||
      interfaceOwner === undefined || !ast.is.IsSourceFile(interfaceOwner)) return "erased";
    const shape = input.objectShapes.resolveNode(declaringInterface, sourceFile);
    const selected = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape, [node]);
    return selected?.kind === "resolved" && selected.member.optional === true ? "erased" : "signature";
  }
}
