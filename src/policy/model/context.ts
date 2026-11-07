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
  SourceProgramFacts,
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

/**
 * The C# policy context. Source answers come only from `facts` (SourceProgramFacts, R2); `ast` is the authored-syntax
 * reader for names, text and structure and never answers a Source type question.
 */
export interface CsharpPolicyContext extends CsharpProviderCallSelectionHost {
  readonly pointerStorage: import("@tsonic/source-core/facts").TsonicPointerStorageRelation;
  readonly moduleCallables: import("../../target-model/records/callables/module-callables.js").CsharpModuleCallableIdentities;
  readonly integerRanges: import("../../target-model/records/operations/integer-ranges.js").CsharpIntegerRangeIndex;
  /**
   * A JS source-profile call-only alias of a declaration: the Host record (analyses.callOnlyAlias) that
   * analysis/operations/source-profiles/callable-aliases.ts admits for the source profile.
   */
  callOnlyAlias(declaration: Node): import("@tsonic/target-api/source").SourceCallOnlyAliasRecord | undefined;
  /**
   * The callable ABI contract (passing modes, optional and params slots, contract carriers) a call use reaches, from the
   * Host call selection: the one owner of the callee ABI (callables/calls), read by source-call arguments (R4 #6).
   */
  sourceCallable(use: Node, selection: "checked" | "implementation"):
    import("../../target-model/records/callables/source-callable-contract.js").SourceCallableContract | undefined;
  readonly typeDefinitions?: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly facts: SourceProgramFacts;
  readonly target: TargetSelection;
  readonly providers: CsharpProviderRelationResolver;
  readonly types: CsharpTypeQueries;
  /** Generic binder constraints of the representation services (C1 representation/generics). */
  readonly typeParameters: import("../../target-model/records/types/type-parameter-constraints.js").CsharpTypeParameterEnvironment;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
}
