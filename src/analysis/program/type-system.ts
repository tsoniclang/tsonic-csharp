import type { Node } from "@tsonic/tsts";
import {
  createCsharpTypeSystem,
  type CsharpTypeSystem,
} from "../../policy/types/model/system.js";
import type {
  CsharpPlanningRepresentationQueries,
  CsharpTypePolicyBaseHost,
} from "../../policy/types/resolution/model.js";
import type { CsharpProjectTypeCatalog } from "../../policy/types/project/project-types.js";
import {
  createCsharpNativeConstructionDemandQuery,
  type CsharpNativeConstructionDemandQueries,
} from "../objects/native-construction-demand.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

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
