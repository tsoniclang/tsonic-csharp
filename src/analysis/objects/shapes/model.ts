import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceDescriptorView, SourceMemberCorrespondenceQueries, SourceValueFacts } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpCaptureInitialization, CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../../target-model/types/representation.js";
import type { CsharpObjectMethodSources } from "../../../target-model/records/native/native-value-carriers.js";

export interface CsharpObjectShapePolicyHost {
  readonly ast: AstReader;
  readonly source: SourceDescriptorView;
  readonly values: SourceValueFacts;
  readonly objects: SourceMemberCorrespondenceQueries;
  readonly sourceStorage: SourceStorageQueries;
  readonly objectMethodSources: CsharpObjectMethodSources;
  representation(): CsharpRepresentationView;
  nativeShape(carrier: TargetTypeRef): CsharpObjectShapeFact | undefined;
  nativeValue(node: Node): CsharpRepresentationOutcome<TargetTypeRef>;
  captureInitialization(declaration: Node): CsharpCaptureInitialization;
}
