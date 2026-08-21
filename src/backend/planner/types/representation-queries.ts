import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTargetProgram,
} from "../../../analysis/program/index.js";
import type {
  CsharpArtifactGraph,
} from "../artifacts/index.js";
import type {
  CsharpPlanningRepresentationQueries,
  ResolvedSourceCallInfo,
} from "../../../policy/types/resolution/model.js";
import type {
  CsharpProjectTypePolicy,
} from "../../../policy/types/project/project-types.js";

export function createCsharpPlanningRepresentationQueries(
  program: CsharpTargetProgram,
  artifacts: CsharpArtifactGraph,
  projectTypes: CsharpProjectTypePolicy,
): CsharpPlanningRepresentationQueries {
  return Object.freeze({
    scopedTargetType(node: Node) {
      return artifacts.requiredStorageType(node);
    },
    sourceCallable(source: ResolvedSourceCallInfo, sourceFile: SourceFile) {
      const selectedCallee = source.sourceCallee.selectedDeclaration;
      if (
        selectedCallee !== undefined &&
        program.source.ast.is.IsClassDeclaration(selectedCallee)
      ) {
        const constructor = projectTypes.implicitConstructorForSignature(
          selectedCallee,
          source.selectedSignature,
        );
        if (constructor !== undefined) {
          return artifacts.sourceCallable({
            kind: "project-constructor",
            targetMemberId: constructor.targetMember.id,
          });
        }
      }
      const declaration = program.source.semantics.forFile(sourceFile)
        .declarations.signatureDeclaration(source.selectedSignature);
      return declaration !== undefined &&
          program.source.navigation.isProjectDeclaration(declaration)
        ? artifacts.sourceCallable({ kind: "declaration", declaration })
        : undefined;
    },
  });
}
