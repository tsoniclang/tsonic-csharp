import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import {
  createCsharpNativeConstructionDemandQuery,
} from "../objects/native-construction-demand.js";
import type { CsharpNativeConstructionDemandQueries } from "../../target-model/records/native-construction.js";
import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import { emptyCsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { selectCsharpArrayTypeGuard } from "../../policy/operations/source-profiles/js/type-tests.js";
import type {
  CsharpRecursiveObjectShapePolicy,
} from "../objects/shapes/model.js";
import { createCsharpObjectShapePolicy } from "../objects/shapes/api.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberReadTargetType,
  csharpObjectShapeMemberRetainsNativeReference,
} from "../../target-model/types/object-shape-members.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpPlanningRepresentationQueries, CsharpTypePolicy, CsharpTypePolicyBaseHost } from "../types/resolution/model.js";
import { createCsharpTypeResolutionServices } from "../types/resolution/engine.js";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../../target-model/records/project-types.js";
import {
  analyzeCsharpProjectTypePolicy,
} from "../project-types/catalog/resolution.js";
import type { CsharpBindingProjectionPolicy } from "../bindings/projection-policy.js";
import { createCsharpBindingProjectionPolicy } from "../bindings/projection-policy.js";
import {
  csharpTargetTypeComponents,
} from "../../target-model/types/components.js";
import type {
  TargetTypeRef,
} from "../../target-model/types/model.js";
import { createCsharpTypeParameterEnvironment } from "../../policy/constraints/type-parameter-environment.js";
import { resolveCsharpTypeParameterConstraints } from "../../policy/constraints/type-parameter-constraints.js";

export interface CsharpTypeSystem {
  readonly typeDefinitions: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly analysisTypes: CsharpTypePolicy;
  readonly objectShapes: CsharpRecursiveObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
}

function createCsharpTypeSystem(
  host: CsharpTypePolicyBaseHost,
  projectTypeCatalog: CsharpProjectTypeCatalog,
  representations: CsharpPlanningRepresentationQueries,
): CsharpTypeSystem {
  let objectShapes: CsharpRecursiveObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const requireProjectTypes = (): CsharpProjectTypePolicy => {
    if (projectTypes === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# project heritage was requested before the type system was fully initialized.");
    return projectTypes;
  };
  const typeParameterConstraints = createCsharpTypeParameterEnvironment(host.ast, (declaration, parameter, source) => {
    const sourceFile = source?.sourceFile ?? host.ast.getSourceFile(declaration);
    if (sourceFile === undefined || !host.hasSemantics(sourceFile)) return undefined;
    const sourceType = source?.sourceType ?? host.semantics(sourceFile).declarations.declaredType(declaration);
    if (sourceType === undefined) return undefined;
    return resolveCsharpTypeParameterConstraints(declaration, parameter, sourceFile, {
      ast: host.ast,
      types: { resolveNode: (node, file) => typeResolution.recursive.resolveNode(node, file, {
        depth: 0, sourceBindings: new Map([[declaration, { sourceType, targetType: parameter }]]),
      }) },
    });
  });
  const createTypeResolution = (
    representations: CsharpPlanningRepresentationQueries,
  ) => createCsharpTypeResolutionServices({
      ...host,
      typeParameterConstraints,
      representations,
      projectTypeCatalog,
      closedTypeGuard(node) {
        const semantics = host.semanticsFor(node);
        return selectCsharpArrayTypeGuard(host, semantics.operations.call(node), semantics.sourceFile);
      },
      bindingProjection(node: Node, sourceFile: SourceFile) {
        if (bindingProjections === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# binding projection ran before type-system initialization.");
        return bindingProjections.resolveProjection(node, sourceFile, { depth: 0 });
      },
      get objectShapes() {
        if (objectShapes === undefined) {
          failTargetAnalysisInvariant("tsonic-csharp", "C# object-shape selection ran before the type system was fully initialized.");
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
          if (objectShapes === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# structural references requested before type-system initialization.");
          return objectShapes.resolveReference(type);
        },
        resolveUnion(type, sourceFile, state) {
          if (objectShapes === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# structural definitions requested before type-system initialization.");
          return objectShapes.resolveUnion(type, sourceFile, state);
        },
        resolveTarget(type) {
          if (objectShapes === undefined) {
            failTargetAnalysisInvariant("tsonic-csharp", "C# structural type resolution ran before the type system was fully initialized.");
          }
          return objectShapes.resolveTarget(type);
        },
        resolveNode(
          node: Node,
          sourceFile: SourceFile,
          state,
        ) {
          if (objectShapes === undefined) {
            failTargetAnalysisInvariant("tsonic-csharp", "C# structural type resolution ran before the type system was fully initialized.");
          }
          if (bindingProjections === undefined) {
            failTargetAnalysisInvariant("tsonic-csharp", "C# binding projection ran before the type system was fully initialized.");
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
            failTargetAnalysisInvariant("tsonic-csharp", "C# structural type resolution ran before the type system was fully initialized.");
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
        ): TargetTypeRef | undefined {
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
          const sourceTarget = selected.kind === "resolved" && selectedType !== undefined &&
            isCsharpJsValueTargetType(selected.member.type)
            ? typeResolution.recursive.resolveType(selectedType, sourceFile, { depth: 0 }) : undefined;
          if (selected.kind === "resolved" && selectedType !== undefined && declaredMemberType !== undefined &&
            host.semantics(sourceFile).types.relationship(declaredMemberType, selectedType) === "identical" &&
            !csharpObjectShapeMemberRetainsNativeReference(sourceTarget, selected.member.type)) {
            return selected.member.type;
          }
          return selected.kind === "resolved"
            ? resolveCsharpObjectShapeMemberReadTargetType(
                selected.member,
                selectedType,
                (left, right) =>
                  host.semantics(sourceFile).types.relationship(left, right) !==
                    "unrelated",
                sourceTarget,
              )
            : undefined;
        },
      },
    });
  const typeResolution = createTypeResolution(representations);
  const types = typeResolution.policy;
  objectShapes = createCsharpObjectShapePolicy({
    ...host,
    typeParameterConstraints,
    representations,
    projectTypeCatalog,
    projectTypes: requireProjectTypes,
    typeResolver: typeResolution.recursive,
  });
  bindingProjections = createCsharpBindingProjectionPolicy({
    ...host,
    typeResolver: typeResolution.recursive,
    objectShapes,
    scopedTargetType: representations.scopedTargetType,
  });
  projectTypes = analyzeCsharpProjectTypePolicy(
    { ...host, types },
    projectTypeCatalog,
  );
  return Object.freeze({
    typeDefinitions: host.typeDefinitions ?? emptyCsharpTypeDefinitions,
    analysisTypes: types,
    objectShapes,
    projectTypes,
  });
}

export interface CsharpTypeAnalysis extends CsharpTypeSystem {
  readonly nativeConstruction: CsharpNativeConstructionDemandQueries;
}

export function createCsharpTypeAnalysis(
  host: CsharpTypePolicyBaseHost,
  catalog: CsharpProjectTypeCatalog,
  representations: CsharpPlanningRepresentationQueries,
): CsharpTypeAnalysis {
  let nativeConstruction: CsharpNativeConstructionDemandQueries | undefined;
  const selectedRepresentations: CsharpPlanningRepresentationQueries = Object.freeze({
    ...representations,
    scopedTargetType(node: Node): TargetTypeRef | undefined {
      return nativeConstruction?.constructionFor(node)?.targetType ?? representations.scopedTargetType(node);
    },
  });
  const system = createCsharpTypeSystem(host, catalog, selectedRepresentations);
  nativeConstruction = createCsharpNativeConstructionDemandQuery(host.sourceStorage, {
    ...host,
    scopedTargetType: representations.scopedTargetType,
    resolveShape: system.objectShapes.resolveType,
    retainSourceShape: system.objectShapes.retainConstructionSource,
  });
  return Object.freeze({ ...system, nativeConstruction });
}
