// The object-shape registry and its inputs. Shapes come from Host object facts through the one representation
// (representation/); this module keeps the canonical .NET shape per carrier (BF16) and answers carrier lookups.
import type { AstReader } from "@tsonic/tsts";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { CsharpObjectShapePolicy } from "../../../target-model/records/objects/object-shapes.js";
import type { CsharpProjectTypeCatalog } from "../../../target-model/records/types/project-types.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import type { CsharpRepresentationServices } from "../../../representation/index.js";

export interface CsharpObjectShapePolicyHost {
  readonly ast: AstReader;
  readonly sourceStorage: SourceStorageQueries;
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  readonly typeParameterConstraints: CsharpTypeParameterEnvironment;
  /** Late-bound: the registry is itself an input of the representation services. */
  representation(): CsharpRepresentationServices;
}

export interface CsharpRecursiveObjectShapePolicy extends CsharpObjectShapePolicy {
  knownShapes(): readonly import("../../../target-model/types/model.js").CsharpObjectShapeFact[];
}
