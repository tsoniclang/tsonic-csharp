import type {
  AstReader,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetSelection,
} from "@tsonic/target-api";
import type {
  SourceFileSemantics,
  SourceProgramNavigation,
} from "@tsonic/target-api/source";
import type {
  CsharpProviderRelationResolver,
} from "../../providers/model/relation-resolver.js";
import type { CsharpProviderCallSelectionHost } from "./provider-calls.js";
import type { CsharpObjectShapePolicy } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpTypeQueries } from "./type-resolution.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import type {
  CsharpSourceIdentityPolicy,
} from "../../source/extension/identities.js";

export interface CsharpPolicyContext extends CsharpProviderCallSelectionHost {
  readonly integerRanges: import("../../target-model/records/operations/integer-ranges.js").CsharpIntegerRangeIndex;
  readonly literalValues: import("@tsonic/target-api/source").SourceLiteralIndex;
  callOnlyAlias(declaration: Node): import("@tsonic/target-api/source").SourceCallOnlyAlias | undefined;
  readonly typeDefinitions?: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly target: TargetSelection;
  readonly providers: CsharpProviderRelationResolver;
  readonly types: CsharpTypeQueries;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}
