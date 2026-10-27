import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemand, CsharpObjectShapeDemandPublication, CsharpObjectShapeProjectionDeclaration } from "../../../../target-model/records/objects/object-shape-demand.js";

export function publishCsharpNativeArtifactDemand(publication: CsharpObjectShapeDemandPublication): CsharpObjectShapeDemand {
  const artifacts = publication.artifacts;
  const byKey = new Map(artifacts.map(artifact => [artifact.key, artifact]));
  if (byKey.size !== artifacts.length) failTargetAnalysisInvariant("tsonic-csharp", "Native artifacts publish one exact fact per key.");
  const projections = new WeakMap<Node, CsharpObjectShapeProjectionDeclaration>();
  for (const { subject, projection } of publication.projectionSubjects) {
    if (projections.has(subject)) failTargetAnalysisInvariant("tsonic-csharp", "A native object projection publishes once.", subject);
    projections.set(subject, projection);
  }
  return Object.freeze({ artifacts, targetShapes: publication.targetShapes,
    get: (key: string) => byKey.get(key), projection: (subject: Node) => projections.get(subject),
  });
}
