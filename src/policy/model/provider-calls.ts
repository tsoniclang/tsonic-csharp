import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpObjectShapeRegistry } from "../../analysis/objects/shapes/model.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/native-definitions.js";
import type { CsharpTypeQueries } from "./type-resolution.js";
import type { CsharpNativeDelegateRegistry } from "../../analysis/callables/native/native-delegates.js";

export interface CsharpProviderOperationHost {
  readonly literals: import("./native-literals.js").CsharpNativeLiteralQueries;
  readonly facts: SourceProgramFacts;
  readonly representation: CsharpRepresentationView;
  readonly sourceStorage: SourceStorageQueries;
  readonly providers: CsharpProviderRelationResolver;
  nativeValue(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef>;
}

export interface CsharpProviderCallInstantiationHost extends CsharpProviderOperationHost {
  readonly integerRanges: import("../../target-model/records/operations/integer-ranges.js").CsharpIntegerRangeIndex;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly objectShapes: CsharpObjectShapeRegistry;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly target: TargetSelection;
  readonly types: CsharpTypeQueries;
  readonly nativeDelegates: CsharpNativeDelegateRegistry;
}

export interface CsharpProviderCallSelectionHost extends CsharpProviderCallInstantiationHost {
  readonly typeDefinitions: CsharpTypeDefinitions;
}
