import type { CsharpSelectedTargetCall } from "../../target-model/records/objects/members.js";
import type { SourceCallSelection } from "@tsonic/target-api/source";
import type { CsharpObjectShapeProjectionDeclaration } from "../../target-model/records/objects/object-shape-demand.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";

export interface CsharpTargetCallEmissionInput {
  readonly typeDefinitions: CsharpTypeDefinitions;
  readonly source: SourceCallSelection;
  readonly selection: CsharpSelectedTargetCall;
  readonly argumentPassing: readonly boolean[];
  readonly optional: boolean;
  readonly projection: CsharpObjectShapeProjectionDeclaration | undefined;
  readonly liftedResult: TargetTypeRef | undefined;
}
