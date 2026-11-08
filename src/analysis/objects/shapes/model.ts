import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceDescriptorView, SourceMemberCorrespondenceQueries, SourceMemberOrigin, SourcePresence, SourceTypeEvidence, SourceValueFacts } from "@tsonic/target-api/source";
import type { CsharpCaptureInitialization, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
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

export interface CsharpObjectShapeRegistry {
  retainShape(shape: CsharpObjectShapeFact, site: Node): CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  resolveTarget(carrier: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  resolveNode(node: Node, sourceFile?: SourceFile): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>>;
  resolveEvidence(evidence: SourceTypeEvidence, carrier: TargetTypeRef, site: Node): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>>;
  resolveMember(evidence: SourceTypeEvidence, carrier: TargetTypeRef, origin: SourceMemberOrigin, site: Node): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeMemberFact>>;
  knownShapes(): readonly CsharpObjectShapeFact[];
  retainConstructionSource(node: Node, shape: CsharpObjectShapeFact): CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  resolveObjectLiteralTargetShape(expected: CsharpObjectShapeFact | undefined, literal: Node, sourceFile?: SourceFile): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>>;
  resolveCopyShape(shape: CsharpObjectShapeFact, site: Node, source?: CsharpObjectShapeFact): CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  resolveNativeParameter(declaration: Node, parameter: Node, carrier: TargetTypeRef): CsharpRepresentationOutcome<TargetTypeRef>;
  resolveNativeReturn(declaration: Node, carrier: TargetTypeRef, observed: readonly TargetTypeRef[]): CsharpRepresentationOutcome<TargetTypeRef>;
}
