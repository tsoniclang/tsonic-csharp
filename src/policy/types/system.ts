import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapePolicy,
} from "./object-shape-policy.js";
import {
  createCsharpObjectShapePolicy,
} from "./object-shape-policy.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberReadTargetType,
} from "./object-shape-members.js";
import type {
  CsharpTypePolicy,
  CsharpTypePolicyBaseHost,
} from "./resolution.js";
import {
  createCsharpTypePolicy,
} from "./resolution.js";
import type {
  CsharpProjectTypePolicy,
} from "./project-types.js";
import {
  createCsharpProjectTypeCatalog,
  createCsharpProjectTypePolicy,
} from "./project-types.js";
import type {
  CsharpBindingProjectionPolicy,
} from "./binding-projection-policy.js";
import {
  createCsharpBindingProjectionPolicy,
} from "./binding-projection-policy.js";
import {
  csharpTargetTypeComponents,
} from "./target-type-components.js";
import type {
  TargetTypeRef,
} from "./definitions.js";

export interface CsharpTypeSystem {
  readonly types: CsharpTypePolicy;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
}

export function createCsharpTypeSystem(
  host: CsharpTypePolicyBaseHost,
): CsharpTypeSystem {
  let objectShapes: CsharpObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const projectTypeCatalog = createCsharpProjectTypeCatalog(host);
  const types = createCsharpTypePolicy({
    ...host,
    projectTypeCatalog,
    projectTypes() {
      if (projectTypes === undefined) {
        throw new Error(
          "C# project heritage was requested before the type system was fully initialized.",
        );
      }
      return projectTypes;
    },
    targetTypeComponents(type) {
      return csharpTargetTypeComponents(
        type,
        objectShapes?.resolveTarget(type),
      );
    },
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
      resolveType(
        type: Type,
        sourceFile: SourceFile,
        authoredTypeRoot?: Node,
      ) {
        if (objectShapes === undefined) {
          throw new Error(
            "C# structural type resolution ran before the type system was fully initialized.",
          );
        }
        return objectShapes.resolveType(
          type,
          sourceFile,
          authoredTypeRoot,
        )?.targetType;
      },
      resolveSelectedProperty(
        receiverType: TargetTypeRef | undefined,
        selectedSubjects: readonly ExtensionFactSubject[],
        selectedType: Type | undefined,
        sourceFile: SourceFile,
      ) {
        if (objectShapes === undefined || receiverType === undefined) {
          return undefined;
        }
        const shape = objectShapes.resolveTarget(receiverType);
        if (shape === undefined) {
          return undefined;
        }
        const selected = resolveCsharpObjectShapeMemberBySelectedSubject(
          shape,
          selectedSubjects,
        );
        return selected.kind === "resolved"
          ? resolveCsharpObjectShapeMemberReadTargetType(
              selected.member,
              selectedType,
              (left, right) =>
                host.semantics(sourceFile).getTypeRelationship(left, right) !==
                  "unrelated",
            )
          : undefined;
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
  projectTypes = createCsharpProjectTypePolicy(
    { ...host, types },
    projectTypeCatalog,
  );
  return Object.freeze({
    types,
    objectShapes,
    projectTypes,
  });
}
