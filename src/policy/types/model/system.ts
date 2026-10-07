import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import { emptyCsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { selectCsharpArrayTypeGuard } from "../../operations/source-profiles/js/type-tests.js";
import type {
  CsharpObjectShapePolicy,
} from "../objects/object-shape-policy.js";
import type {
  CsharpRecursiveObjectShapePolicy,
} from "../objects/object-shape-policy/model.js";
import {
  createCsharpObjectShapePolicy,
} from "../objects/object-shape-policy.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberReadTargetType,
} from "../../../target-model/types/object-shape-members.js";
import type {
  CsharpPlanningRepresentationQueries,
  CsharpTypePolicy,
  CsharpTypePolicyBaseHost,
} from "../resolution/index.js";
import {
  createCsharpTypeResolutionServices,
} from "../resolution/engine.js";
import type {
  CsharpProjectTypeCatalog,
  CsharpProjectTypePolicy,
} from "../project/project-types.js";
import {
  createCsharpProjectTypePolicy,
} from "../project/project-types.js";
import type {
  CsharpBindingProjectionPolicy,
} from "../objects/binding-projection-policy.js";
import {
  createCsharpBindingProjectionPolicy,
} from "../objects/binding-projection-policy.js";
import {
  createCsharpNativeConstructionDemandQuery,
  type CsharpNativeConstructionDemandQueries,
} from "../objects/native-construction-demand.js";
import {
  csharpTargetTypeComponents,
} from "../../../target-model/types/components.js";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../../target-model/types/model.js";

export interface CsharpTypeSystem {
  readonly typeDefinitions: import("../../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly analysisTypes: CsharpTypePolicy;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly nativeConstruction: CsharpNativeConstructionDemandQueries;
}

export function createCsharpTypeSystem(
  host: CsharpTypePolicyBaseHost,
  projectTypeCatalog: CsharpProjectTypeCatalog,
  representations: CsharpPlanningRepresentationQueries =
    emptyPlanningRepresentations,
  sourceStorage: SourceStorageQueries,
): CsharpTypeSystem {
  let objectShapes: CsharpRecursiveObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  let nativeConstruction: CsharpNativeConstructionDemandQueries | undefined;
  const selectedRepresentations: CsharpPlanningRepresentationQueries = Object.freeze({
    ...representations,
    scopedTargetType(node: Node): TargetTypeRef | undefined {
      return nativeConstruction?.shapeFor(node)?.targetType ?? representations.scopedTargetType(node);
    },
  });
  const requireProjectTypes = (): CsharpProjectTypePolicy => {
    if (projectTypes === undefined) throw new Error("C# project heritage was requested before the type system was fully initialized.");
    return projectTypes;
  };
  const createTypeResolution = (
    representations: CsharpPlanningRepresentationQueries,
  ) => createCsharpTypeResolutionServices({
      ...host,
      representations,
      projectTypeCatalog,
      closedTypeGuard(node) {
        const semantics = host.semanticsFor(node);
        return selectCsharpArrayTypeGuard(host, semantics.operations.call(node), semantics.sourceFile);
      },
      bindingProjection(node: Node, sourceFile: SourceFile) {
        if (bindingProjections === undefined) throw new Error("C# binding projection ran before type-system initialization.");
        return bindingProjections.resolveProjection(node, sourceFile, { depth: 0 });
      },
      get objectShapes() {
        if (objectShapes === undefined) {
          throw new Error("C# object-shape selection ran before the type system was fully initialized.");
        }
        return objectShapes;
      },
      projectTypes: requireProjectTypes,
      targetTypeComponents(type) {
        return csharpTargetTypeComponents(
          type,
          objectShapes?.resolveTarget(type),
        );
      },
      structuralTypes: {
        resolveReference(type) {
          if (objectShapes === undefined) throw new Error("C# structural references requested before type-system initialization.");
          return objectShapes.resolveReference(type);
        },
        resolveUnion(type, sourceFile, state) {
          if (objectShapes === undefined) throw new Error("C# structural definitions requested before type-system initialization.");
          return objectShapes.resolveUnion(type, sourceFile, state);
        },
        resolveTarget(type) {
          if (objectShapes === undefined) {
            throw new Error("C# structural type resolution ran before the type system was fully initialized.");
          }
          return objectShapes.resolveTarget(type);
        },
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
          declaredMemberType: Type | undefined,
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
          if (selected.kind === "resolved" && selectedType === undefined) return selected.member.type;
          if (selected.kind === "resolved" && selectedType !== undefined && declaredMemberType !== undefined &&
            host.semantics(sourceFile).types.relationship(declaredMemberType, selectedType) === "identical") {
            return selected.member.type;
          }
          return selected.kind === "resolved"
            ? resolveCsharpObjectShapeMemberReadTargetType(
                selected.member,
                selectedType,
                (left, right) =>
                  host.semantics(sourceFile).types.relationship(left, right) !==
                    "unrelated",
              )
            : undefined;
        },
      },
    });
  const typeResolution = createTypeResolution(selectedRepresentations);
  const types = typeResolution.policy;
  objectShapes = createCsharpObjectShapePolicy({
    ...host,
    representations: selectedRepresentations,
    projectTypeCatalog,
    projectTypes: requireProjectTypes,
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
  nativeConstruction = createCsharpNativeConstructionDemandQuery(sourceStorage, {
    ...host,
    scopedTargetType: representations.scopedTargetType,
    resolveShape(type: Type, file: SourceFile): CsharpObjectShapeFact | undefined {
      return objectShapes?.resolveType(type, file);
    },
  });
  return Object.freeze({
    typeDefinitions: host.typeDefinitions ?? emptyCsharpTypeDefinitions,
    analysisTypes: types,
    objectShapes,
    projectTypes,
    nativeConstruction,
  });
}

const emptyPlanningRepresentations: CsharpPlanningRepresentationQueries =
  Object.freeze({
    requiresClosedStructuralContract() {
      return false;
    },
    scopedTargetType() {
      return undefined;
    },
    sourceCallable() {
      return undefined;
    },
  });
