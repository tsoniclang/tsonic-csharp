import type { AstReader, ReadonlySourceFactResolver, SourceFile } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { SourceFileSemantics, SourceProgramNavigation, SourceLiteralIndex } from "@tsonic/target-api/source";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpValueDomainCarrierQueries } from "../../target-model/records/value-domains.js";
import type { CsharpObjectShapePolicy } from "../../target-model/records/object-shapes.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/project-types.js";
import type { CsharpTypeQueries } from "./type-resolution.js";
export interface CsharpProviderOperationHost {
  readonly sourceStorage?: SourceStorageQueries;
  readonly valueDomainCarriers?: CsharpValueDomainCarrierQueries;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly providers: CsharpProviderRelationResolver;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
}
export interface CsharpProviderCallInstantiationHost extends CsharpProviderOperationHost {
  readonly ast: AstReader;
  readonly literalValues: SourceLiteralIndex;
  readonly navigation: SourceProgramNavigation;
  readonly objectShapes?: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly target: TargetSelection;
  readonly types: CsharpTypeQueries;
}
export interface CsharpProviderCallSelectionHost extends CsharpProviderCallInstantiationHost {
  readonly typeDefinitions?: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
}
