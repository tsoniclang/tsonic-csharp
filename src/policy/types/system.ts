import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapePolicy,
} from "./object-shape-policy.js";
import {
  createCsharpObjectShapePolicy,
} from "./object-shape-policy.js";
import type {
  CsharpTypePolicy,
  CsharpTypePolicyBaseHost,
} from "./resolution.js";
import {
  createCsharpTypePolicy,
} from "./resolution.js";

export interface CsharpTypeSystem {
  readonly types: CsharpTypePolicy;
  readonly objectShapes: CsharpObjectShapePolicy;
}

export function createCsharpTypeSystem(
  host: CsharpTypePolicyBaseHost,
): CsharpTypeSystem {
  let objectShapes: CsharpObjectShapePolicy | undefined;
  const types = createCsharpTypePolicy({
    ...host,
    structuralTypes: {
      resolveNode(
        node: Node,
        sourceFile: SourceFile,
      ) {
        if (objectShapes === undefined) {
          throw new Error(
            "C# structural type resolution ran before the type system was fully initialized.",
          );
        }
        return objectShapes.resolveProjectedType(node, sourceFile) ??
          objectShapes.resolveNode(node, sourceFile)?.targetType;
      },
    },
  });
  objectShapes = createCsharpObjectShapePolicy({
    ...host,
    types,
  });
  return Object.freeze({
    types,
    objectShapes,
  });
}
