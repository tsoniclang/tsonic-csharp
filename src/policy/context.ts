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
  CsharpSourceOutputIdentityPlanner,
} from "./names/source-output-identities.js";
import type {
  CsharpProviderRelationResolver,
} from "../providers/model/relation-resolver.js";
import type {
  CsharpProviderCallSelectionHost,
} from "./members/index.js";
import type {
  CsharpObjectShapePolicy,
  CsharpProjectTypePolicy,
  CsharpTypePolicy,
} from "./types/index.js";

export interface CsharpPolicyContext extends CsharpProviderCallSelectionHost {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly target: TargetSelection;
  readonly providers: CsharpProviderRelationResolver;
  readonly types: CsharpTypePolicy;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly outputIdentities: CsharpSourceOutputIdentityPlanner;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}
