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
import type {
  CsharpBindingProjectionPolicy,
} from "./binding-projection-policy.js";
import {
  createCsharpBindingProjectionPolicy,
} from "./binding-projection-policy.js";

export interface CsharpTypeSystem {
  readonly types: CsharpTypePolicy;
  readonly objectShapes: CsharpObjectShapePolicy;
}

export function createCsharpTypeSystem(
  host: CsharpTypePolicyBaseHost,
): CsharpTypeSystem {
  let objectShapes: CsharpObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
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
        if (bindingProjections === undefined) {
          throw new Error(
            "C# binding projection ran before the type system was fully initialized.",
          );
        }
        return bindingProjections.resolveNode(node, sourceFile) ??
          objectShapes.resolveNode(node, sourceFile)?.targetType;
      },
    },
  });
  objectShapes = createCsharpObjectShapePolicy({
    ...host,
    types,
  });
  bindingProjections = createCsharpBindingProjectionPolicy({
    ...host,
    types,
    objectShapes,
  });
  return Object.freeze({
    types,
    objectShapes,
  });
}
