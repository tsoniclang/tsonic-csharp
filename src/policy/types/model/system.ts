import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapePolicy,
} from "../objects/object-shape-policy.js";
import type {
  CsharpRecursiveObjectShapePolicy,
} from "../objects/object-shape-policy/api.js";
import {
  createCsharpObjectShapePolicy,
} from "../objects/object-shape-policy.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberReadTargetType,
} from "../objects/object-shape-members.js";
import type {
  CsharpTypePolicy,
  CsharpTypePolicyBaseHost,
} from "../resolution/index.js";
import {
  createCsharpTypeResolutionServices,
} from "../resolution/engine.js";
import type {
  CsharpProjectTypePolicy,
} from "../project/project-types.js";
import {
  createCsharpProjectTypeCatalog,
  createCsharpProjectTypePolicy,
} from "../project/project-types.js";
import type {
  CsharpBindingProjectionPolicy,
} from "../objects/binding-projection-policy.js";
import {
  createCsharpBindingProjectionPolicy,
} from "../objects/binding-projection-policy.js";
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
  let objectShapes: CsharpRecursiveObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const projectTypeCatalog = createCsharpProjectTypeCatalog(host);
  const typeResolution = createCsharpTypeResolutionServices({
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
        state,
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
        return bindingProjections.resolveNode(node, sourceFile, state) ??
          objectShapes.resolveNodeWithState(node, sourceFile, state)?.targetType;
      },
      resolveType(
        type: Type,
        sourceFile: SourceFile,
        state,
        authoredTypeRoot?: Node,
      ) {
        if (objectShapes === undefined) {
          throw new Error(
            "C# structural type resolution ran before the type system was fully initialized.",
          );
        }
        return objectShapes.resolveTypeWithState(
          type,
          sourceFile,
          authoredTypeRoot,
          state,
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
  const types = typeResolution.policy;
  objectShapes = createCsharpObjectShapePolicy({
    ...host,
    typeResolver: typeResolution.recursive,
  });
  bindingProjections = createCsharpBindingProjectionPolicy({
    ...host,
    typeResolver: typeResolution.recursive,
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
