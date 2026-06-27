import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const analysisAbstractionRules = Object.freeze([
  {
    id: "source-member-declaring-name",
    pattern: /sourceMember\.declaringName/g,
    replacement:
      "Use selected TSTS declaration/signature identity, then policy/provider facts.",
  },
  {
    id: "source-member-name",
    pattern: /sourceMember\.memberName/g,
    replacement:
      "Use selected TSTS declaration/signature identity, then policy/provider facts.",
  },
  {
    id: "source-library-type-check",
    pattern: /isSourceLibraryType\s*\(/g,
    replacement:
      "Use source identity/type-classification facts instead of source-library family branches.",
  },
  {
    id: "source-library-member-read",
    pattern: /getSourceLibraryMember\s*\(/g,
    replacement:
      "Read source-library members only inside source identity or policy adapters.",
  },
  {
    id: "source-member-id-branch",
    pattern: /sourceMember\.id\s*(?:={2,3}|!={1,2})/g,
    replacement:
      "Use declarative source identity policy records instead of source-member id control-flow branches.",
  },
  {
    id: "source-member-id-optional-branch",
    pattern: /sourceMember\?\.id\s*(?:={2,3}|!={1,2})/g,
    replacement:
      "Use declarative source identity policy records instead of optional-chained source-member id control-flow branches.",
  },
  {
    id: "source-member-id-prefix-branch",
    pattern: /sourceMember\.id\.startsWith\s*\(/g,
    replacement:
      "Use declarative source identity policy records instead of source-member prefix control-flow branches.",
  },
  {
    id: "source-member-id-switch",
    pattern: /switch\s*\(\s*sourceMember\.id\s*\)/g,
    replacement:
      "Use declarative source identity policy records instead of switch-based source-member id selectors.",
  },
  {
    id: "source-member-id-method-branch",
    pattern: /sourceMember\.id\.(?:includes|endsWith|match)\s*\(/g,
    replacement:
      "Use declarative source identity policy records instead of source-member id string-method selector branches.",
  },
  {
    id: "source-member-id-map-dispatch",
    pattern: /\b[A-Za-z_$][\w$]*(?:BySource(?:Identity|Member|Id)?|ByIdentity|BySourceMember|RequirementRows|Requirements|Policies|Policy|Providers|Resolvers|Rows|Index|Map|Members|TargetMembers|TargetMember)?\.(?:get|has)\s*\(\s*sourceMember\.id\s*\)/g,
    allowedFilePattern: sourceIdentityMetadataFilePattern(),
    replacement:
      "Do not dispatch operations, carriers, policies, or target members by sourceMember.id Map lookups; consume selected declaration/signature identity through generic metadata selectors.",
  },
  {
    id: "source-member-id-set-table-definition",
    pattern: /\b(?:sourceMemberIdSet|sourceLibraryMemberIdSet)\s*\(\s*(?:\[|[A-Za-z_$][\w$]*)/g,
    allowedFilePattern: sourceIdentityMetadataFilePattern(),
    replacement:
      "Source member id sets belong only in pure source identity metadata modules; analysis, carrier, and target policy tables must use generic metadata facts.",
  },
  {
    id: "candidate-target-id-branch",
    pattern: /candidate\.id\s*(?:={2,3}|!={1,2})/g,
    replacement:
      "Select target members with provider metadata and the generic selector, not target id control-flow branches.",
  },
  {
    id: "source-name-branch",
    pattern: /\bsourceName\s*(?:={2,3}|!={1,2})\s*["']/g,
    replacement:
      "Concrete source names belong in declarative policy/provider metadata, not generic control-flow branches.",
  },
  {
    id: "source-name-switch",
    pattern: /switch\s*\(\s*sourceName\s*\)/g,
    replacement:
      "Concrete source names belong in declarative policy/provider metadata, not switch-based selectors.",
  },
  {
    id: "source-name-method-branch",
    pattern: /\bsourceName\.(?:includes|endsWith|match)\s*\(|\bsourceName\.startsWith\s*\(\s*["'](?!#["'])/g,
    replacement:
      "Concrete source names belong in declarative policy/provider metadata, not string-method selector branches.",
  },
  {
    id: "map-set-carrier-source-family-branch",
    pattern: /\b(?:sourceName|declaringName|sourceMember\.(?:declaringName|memberName))\s*(?:={2,3}|!={1,2})\s*["'](?:Map|Set|ReadonlyMap|ReadonlySet)["']/g,
    replacement:
      "Map/Set carrier lane selection must consume selected source identity plus declared lane/equality facts; backend and selectors must not choose Dictionary, HashSet, or JS runtime carriers from source-family spelling.",
  },
  {
    id: "export-name-switch",
    pattern: /switch\s*\(\s*exportName\s*\)/g,
    replacement:
      "Concrete provider export names belong in declarative metadata tables, not switch-based selectors.",
  },
  {
    id: "member-declaring-name-branch",
    pattern: /\bmember\.declaringName\s*(?:={2,3}|!={1,2})\s*["']/g,
    replacement:
      "Concrete declaring names belong in declarative source identity metadata, not generic control-flow branches.",
  },
  {
    id: "candidate-target-id-find",
    pattern: /candidates\.find\s*\(\s*\(?\s*candidate\s*\)?\s*=>\s*candidate\.id/g,
    replacement:
      "Index provider metadata by selected source declaration/signature identity instead of scanning candidates by target id.",
  },
  {
    id: "callee-property-source-name-filter",
    pattern: /candidate\.sourceName\s*===\s*request\.calleePropertyName/g,
    replacement:
      "Provider receiver call mapping must use selected declaration/signature identity, not callee property spelling.",
  },
  {
    id: "synthesized-native-array-target-member",
    pattern: /createDotnetNativeArrayTargetMember|__tsonic_native_array_create/g,
    replacement:
      "Native array creation members must come from provider metadata; missing provider metadata is a diagnostic.",
  },
  {
    id: "source-library-declaring-name-type",
    pattern: /\bSourceLibraryDeclaringName\b/g,
    replacement:
      "Keep concrete TypeScript library names inside source identity extraction or declarative policy data only.",
  },
  {
    id: "source-library-member-id-type",
    pattern: /\bSourceLibraryMemberId\b/g,
    replacement:
      "Keep concrete TypeScript library member ids inside source identity extraction or declarative policy data only.",
  },
  {
    id: "source-library-member-ad-hoc-match",
    pattern: /(?<!function\s)\bsourceLibraryMemberMatchesAny(?:Prefix)?\s*\(/g,
    replacement:
      "Route concrete source member ids through named SourceLibraryMemberIdentityPolicy records before generic matching.",
  },
  {
    id: "target-member-helper",
    pattern: /(?<!function\s)\btarget(?:Method|Property|Constructor)\s*\(/g,
    replacement:
      "Represent target members as provider metadata or explicit policy exceptions.",
  },
  {
    id: "target-member-table",
    pattern: /\bget[A-Za-z0-9]+TargetMembers\s*\(/g,
    replacement:
      "Select target members through generic provider metadata selectors.",
  },
  {
    id: "product-console-debug",
    pattern: /\bconsole\.(?:error|log|warn|debug)\s*\(/g,
    replacement:
      "Use structured diagnostics or test-only logging outside product source.",
  },
  {
    id: "module-specifier-branch",
    pattern: /\b(?:canonicalDeclaration|canonicalSpecifier|declaration|symbol)\.moduleSpecifier\s*===/g,
    replacement:
      "Select provider modules through canonical provider metadata indexes, not branch chains on module specifiers.",
  },
  {
    id: "nodejs-direct-module-resolver-map",
    pattern: /\bdirectIdentityTargetMemberResolversByModule\b/g,
    replacement:
      "Derive Node direct member resolution from canonical provider metadata rows, not a module-to-resolver function map.",
  },
  {
    id: "nodejs-target-identity-map",
    pattern: /\bnodejs(?:TargetMembersByProviderSymbolIdentity|UnsupportedTargetIdentitiesByProviderSymbol)\b/g,
    replacement:
      "Derive Node target identities and unsupported identities from the same canonical provider metadata records used for operation mapping.",
  },
  {
    id: "nodejs-direct-target-member-identity-map",
    pattern: /\bnode[A-Za-z0-9]+TargetMembersByIdentity\b/g,
    replacement:
      "Use the canonical Node provider metadata index instead of per-module target-member identity maps.",
  },
  {
    id: "source-family-call-provider-registry",
    pattern: /\b(?:csharpJsSourceLibraryProviders|providerForSourceMember|simpleCallProvider)\b/g,
    replacement:
      "Replace source-family call-provider registries with source identity policy data plus generic provider/runtime metadata selectors.",
  },
  {
    id: "source-family-closed-facts-validator",
    pattern: /\b(?:jsonClosedFactsValidators|objectClosedFactsValidators|callClosedReceiverPolicies)\b/g,
    replacement:
      "Closed-fact validation must consume generic lazy analysis records and provider facts, not source-family validator tables.",
  },
  {
    id: "source-family-closed-facts-requirement",
    filePattern: /(?:^|\/)surfaces\/js\/calls\/closed-facts\/[^/]+\.ts$/,
    pattern: /"(?:array-receiver|collection-receiver)"|\btarget\s*:\s*"(?:map|set)"/g,
    replacement:
      "Closed-fact requirements must use generic requirement and target-predicate kinds; concrete source families belong in declarative identity rows or provider metadata.",
  },
  {
    id: "executable-surface-member-template",
    pattern: /\bcreateMembers\s*:\s*\(/g,
    replacement:
      "Surface member definitions must be provider/runtime metadata records or explicit exception records, not executable per-member templates.",
  },
  {
    id: "array-specific-use-classifier",
    pattern: /\b(?:ArrayUse|collectArrayUsesForSymbol|classifyIdentifierArrayUse|classifySourceLibraryArrayPropertyUse|classifySourceLibraryStaticCallArgumentUse)\b/g,
    replacement:
      "Use lazy generic analysis services for references, property writes, element writes, calls, captures, escapes, and mutations; array carrier planning consumes those structural records.",
  },
  {
    id: "source-member-name-to-target-lookup",
    pattern: /\b[A-Za-z0-9]*(?:TargetMember|TargetMembers|PropertyTargetMember)s?ForSourceName\s*\(\s*sourceLibraryMemberName\s*\(\s*sourceMember\s*\)/g,
    replacement:
      "Do not convert selected source member names into target member lookups; provider/runtime metadata rows must prove the target operation.",
  },
  {
    id: "source-name-target-member-helper-api",
    pattern: /\b(?:jsSurface(?:Single)?TargetMembers?ForSourceName|[A-Za-z0-9]+(?:TargetMember|TargetMembers|PropertyTargetMember)s?ForSourceName)\b/g,
    replacement:
      "Replace source-name target-member helper APIs with selected source declaration/signature identity indexes.",
  },
  {
    id: "js-surface-source-member-target-lookup-api",
    filePattern: /(?:^|\/)surfaces\/js\/.+\.ts$/,
    pattern: /\b(?:jsSurface(?:Selected)?TargetMembersForSourceMember|[A-Za-z0-9]+(?:TargetMembers?|PropertyTargetMember)ForSourceMember)\b/g,
    replacement:
      "JS surface target lookup APIs must consume selected source identity rows, not raw SourceLibraryMember values.",
  },
  {
    id: "source-name-runtime-member-filter",
    pattern: /\.filter\s*\(\s*\(?\s*(?:member|row|candidate|record)\s*\)?\s*=>\s*(?:member|row|candidate|record)\.sourceName\s*(?:={2,3}|!={1,2})/g,
    replacement:
      "Do not select target/runtime members by filtering sourceName at execution time; use declarative rows indexed by selected source identity or explicit operation metadata.",
  },
  {
    id: "source-library-member-name-call",
    pattern: /(?<!function\s)\bsourceLibraryMemberName\s*\(/g,
    replacement:
      "Do not derive operation semantics from a selected member's spelling; use source identity records and provider metadata indexes.",
  },
  {
    id: "source-id-executable-policy-hook",
    pattern: /(?:^|[{,]\s*)\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:\s*(?:(?:\([^\n)]*\)|[A-Za-z_$][\w$]*)\s*=>|function\b|[A-Za-z_$][\w$]*(?=\s*[,}]))/gm,
    replacement:
      "Source-identity policy tables must be declarative metadata or explicit exception records, not executable semantic hooks.",
  },
  {
    id: "source-id-analysis-table-definition",
    pattern: /\b(?:const|export\s+const)\s+(?:sourceCallPolicyRecords|closedReceiverRequirementPolicies|closedFactRules|propertyReceiverValidatorPolicies|arrayPropertyUseRules|staticCallArgumentUseRules|propertyMemberResolvers|propertyMemberProviders|propertyPrecheckRules)\b/g,
    replacement:
      "Source-id analysis tables are migration debt until they are pure declarative metadata consumed by generic selectors.",
  },
  {
    id: "source-id-analysis-table-lookup",
    pattern: /\b(?:sourceCallPolicyRecords|closedFactRules|arrayPropertyUseRules|staticCallArgumentUseRules|propertyMemberResolvers|propertyMemberProviders|propertyPrecheckRules|propertyReceiverValidatorPolicies)\.(?:find|some)\s*\([^\n]*(?:sourceMember|sourceLibraryMemberMatches)/g,
    replacement:
      "Source-id table dispatch must become generic selector lookup over selected declaration/signature identity and metadata rows.",
  },
  {
    id: "function-valued-source-member-provider-hook",
    pattern: /\b[A-Za-z_$][\w$]*ForSourceMember\s*:\s*\([^)\n]*\bsourceMember\b[^)\n]*\)\s*=>/g,
    replacement:
      "Provider metadata rows must name provider/runtime metadata records; do not store executable hooks that accept sourceMember.",
  },
  {
    id: "source-member-provider-hook-dispatch",
    pattern: /\b[A-Za-z_$][\w$]*\.membersForSourceMember\s*\(\s*sourceMember\s*\)/g,
    replacement:
      "Source-member provider hook dispatch must become generic selection over declarative provider metadata rows.",
  },
  {
    id: "js-surface-call-provider-kind-literal",
    filePattern: /(?:^|\/)surfaces\/js\/calls\/member-providers\/[^/]+\.ts$/,
    pattern: /"(?:date-call-kind|object-composite|array-carrier|collection-carrier|console-metadata)"/g,
    replacement:
      "JS surface call provider behavior must be declared as provider metadata facts; source-family kind literals must not drive generic call analysis or target selection.",
  },
  {
    id: "js-surface-source-family-provider-flag",
    filePattern: /(?:^|\/)surfaces\/js\/calls\/member-providers\/[^/]+\.ts$/,
    pattern: /\b(?:dateCallConstructMembers|objectPrimitiveReceiverMembers|objectRecordDictionaryMembers|arrayCarrierMembers|collectionCarrierMembers|membersExist|arrayMembersOrCallSurface|collectionMembersExist)\b/g,
    replacement:
      "JS surface call mapping must use declarative operation rows and generic target providers, not source-family boolean flags or family-specific callable policy flags.",
  },
  {
    id: "js-surface-target-provider-raw-source-member",
    filePattern: /(?:^|\/)surfaces\/js\/calls\/member-providers\/[^/]+\.ts$/,
    pattern: /\b(?:readonly\s+sourceMember\s*:\s*SourceLibraryMember|request\.sourceMember)\b/g,
    replacement:
      "JS surface executable target providers must consume selected source identity and finalized facts; raw source members belong only at the identity-extraction boundary.",
  },
  {
    id: "js-surface-call-legacy-provider-shape",
    filePattern: /(?:^|\/)surfaces\/js\/calls\/member-providers\/[^/]+\.ts$/,
    pattern: /\b(?:SourceCallMetadataRow|JsSurfaceCallPolicyKind|JsSurfaceCallTargetProvider|JsSurfaceCallTargetProviderAdapter|sourceCallMetadataRows|metadataIndexPolicy|operationAdapterProvider)\b|\bkind\s*:\s*"(?:adapter|operation-adapter)"/g,
    replacement:
      "JS surface calls must use one JsSurfaceOperationRow schema and generic operation target providers; legacy call-provider shapes and adapter-only provider kinds are not allowed.",
  },
  {
    id: "js-surface-call-executable-target-provider-callback",
    filePattern: /(?:^|\/)surfaces\/js\/calls\/member-providers\/[^/]+\.ts$/,
    pattern: /\b(?:JsSurfaceOperationTargetProviderResolver|readonly\s+resolver\s*:|selectTargetMembers\s*:|hasCallableProvider\s*:)/g,
    replacement:
      "JS surface operation rows must reference declarative provider/runtime metadata, carrier selectors, or explicit exception ids; executable target-provider callbacks are not allowed in row/provider shape.",
  },
  {
    id: "js-surface-selected-target-executable-callback",
    filePattern: /(?:^|\/)surfaces\/js\/selected-target-member-metadata\.ts$/,
    pattern: /\b(?:readonly\s+resolver\s*:|selectTargetMembers\s*:|\.selectTargetMembers\s*\()/g,
    replacement:
      "Selected target-member metadata must be declarative metadata providers plus generic materialization; executable selected-target callbacks are not allowed.",
  },
  {
    id: "js-surface-call-selector-declaring-type-synthesis",
    filePattern: /(?:^|\/)surfaces\/js\/calls\/target-selection\.ts$/,
    pattern: /\b(?:sourceLibraryCallSelectionOptions|declaringTargetType|declaringTypeParameters|getCsharpArrayLikeElementType)\b/g,
    replacement:
      "JS surface call selection must use selected target member metadata plus generic argument/receiver inference; it must not synthesize declaring type arguments from JS source-family receiver shapes.",
  },
  {
    id: "js-surface-property-provider-kind-literal",
    filePattern: /(?:^|\/)surfaces\/js\/properties\/member-providers\/[^/]+\.ts$/,
    pattern: /"(?:collection-size|string-length|array-length)"/g,
    replacement:
      "JS surface property provider behavior must be declared as provider metadata facts; source-family kind literals must not drive generic property analysis or target selection.",
  },
  {
    id: "js-surface-property-legacy-provider-shape",
    filePattern: /(?:^|\/)surfaces\/js\/properties\/member-providers\/[^/]+\.ts$/,
    pattern: /\b(?:CsharpJsPropertyMemberProvider(?:Value)?|CsharpJsPropertyPrecheck(?:Rule|Result)|propertyMemberProviderBySourceIdentity|propertyMemberRows|propertyPrecheckRows|propertyPrecheckRuleSelectors|propertyMemberFromProvider|fixedMetadataRow(?:FromIndex)?|fixedReceiverMetadataRow)\b|\bkind\s*:\s*"(?:adapter|operation-adapter|property-adapter|property-provider)"/g,
    replacement:
      "JS surface properties must use one JsSurfacePropertyRow schema and generic property target providers; legacy property-provider shapes and adapter-only provider kinds are not allowed.",
  },
  {
    id: "js-surface-property-provider-raw-source-member",
    filePattern: /(?:^|\/)surfaces\/js\/properties\/member-providers\/[^/]+\.ts$/,
    pattern: /\b(?:readonly\s+sourceMember\s*:\s*SourceLibraryMember|request\.sourceMember)\b/g,
    replacement:
      "JS surface executable property providers must consume selected source identity and finalized facts; raw source members belong only at the identity-extraction boundary.",
  },
  {
    id: "js-surface-property-executable-target-provider-callback",
    filePattern: /(?:^|\/)surfaces\/js\/properties\/member-providers\/[^/]+\.ts$/,
    pattern: /\b(?:JsSurfacePropertyTargetProviderResolver|readonly\s+resolver\s*:|selectTargetMembers\s*:|\.selectTargetMembers\s*\()/g,
    replacement:
      "JS surface property rows must reference declarative provider/runtime metadata or receiver selectors; executable target-provider callbacks are not allowed in row/provider shape.",
  },
  {
    id: "js-array-lifecycle-source-member-factory-list",
    filePattern: /(?:^|\/)surfaces\/js\/array-carrier-lifecycle\/[^/]+\.ts$/,
    pattern: /\b(?:SelectedSourceMemberTargetMemberFactory|selectedSourceMemberTargetMemberFactories|arrayTargetMembersForSourceMember|objectTargetMembersForSourceMember|jsonTargetMembersForSourceMember)\b/g,
    replacement:
      "Array carrier lifecycle must consume generic structural analysis and selected-target metadata rows, not maintain source-family target-member factory lists.",
  },
  {
    id: "js-array-lifecycle-raw-source-member-selection",
    filePattern: /(?:^|\/)surfaces\/js\/array-carrier-lifecycle\/(?!source-library-selection\.ts$)[^/]+\.ts$/,
    pattern: /\b(?:getSelectedSourceLibraryMemberForStructuralUse|SourceLibraryMember)\b/g,
    replacement:
      "Array carrier lifecycle planning must consume selected source identity extracted from structural analysis records; raw source-library members are allowed only at the source identity extraction boundary.",
  },
  {
    id: "procedural-source-member-table-dispatch",
    pattern: /\b[A-Za-z_$][\w$]*(?:Policies|PolicyRows|Rules|Rows|Records|Providers|Resolvers|Requirements|RequirementRows|MemberPolicies|CallPolicies)\.(?:find|some)\s*\([\s\S]{0,240}?\b(?:sourceMember|sourceLibraryMemberMatches)\b/g,
    replacement:
      "Policy/table dispatch over sourceMember must become a generic selector lookup over selected declaration/signature identity and declarative metadata rows.",
  },
  {
    id: "dynamic-target-member-from-source-member",
    pattern: /\bjsSurfaceTargetMemberFromMetadata\s*\(\s*\{[\s\S]{0,500}?\bsourceLibraryMember(?:Name|Identity)\s*\(\s*sourceMember\s*\)/g,
    replacement:
      "Target members must come from provider/runtime metadata rows with declared semantic equivalence, not be synthesized from a source member at selection time.",
  },
  {
    id: "target-member-source-name-synthesis",
    pattern: /\b(?:targetName\s*:\s*(?:sourceName|sourceMember\.memberName|sourceLibraryMemberName\s*\(\s*sourceMember\s*\))|id\s*:\s*`[^`]*\$\{\s*(?:sourceName|sourceMember\.id|sourceLibraryMemberIdentity\s*\(\s*sourceMember\s*\))\s*\})/g,
    replacement:
      "Target member names and ids must be declared by provider/runtime metadata rows, not synthesized from source member names or identities.",
  },
  {
    id: "js-array-target-id-source-name-default",
    filePattern: /(?:^|\/)surfaces\/js\/arrays\/target-members\/[^/]+\.ts$/,
    pattern: /\b(?:idSuffix\s*=\s*sourceName|options\.(?:idSuffix|idBase)\s*\?\?\s*sourceName|idSuffix\s*:\s*`\$\{\s*sourceName\s*\}|idBase\s*:\s*`\$\{\s*sourceName\s*\})/g,
    replacement:
      "Array provider/runtime target operation ids must be explicit metadata fields; builders must not default ids from source member names.",
  },
  {
    id: "provider-row-target-member-from-created-source-member",
    filePattern: /(?:^|\/)surfaces\/js\/(?:calls|properties)\/member-providers\/[^/]+\.ts$/,
    pattern: /\b[A-Za-z0-9]+(?:Property)?TargetMembers?ForSourceMember\s*\(\s*createSourceLibraryMember\s*\(/g,
    replacement:
      "Provider rows must reference provider metadata rows directly; do not synthesize target members by recreating source-library members from source names.",
  },
  {
    id: "node-local-export-signature-selection",
    filePattern: /(?:^|\/)surfaces\/nodejs\/.+\.ts$/,
    pattern: /\.find\s*\(\s*\(?\s*(?:entry|member|row|candidate)\s*\)?\s*=>\s*(?:entry|member|row|candidate)\.(?:exportName|signatureId|memberName)\s*===/g,
    replacement:
      "Node provider member selection must use canonical declaration/signature identity indexes rather than local export/signature search.",
  },
  {
    id: "nodejs-target-id-source-name-synthesis",
    filePattern: /(?:^|\/)surfaces\/nodejs\/.+\.ts$/,
    pattern: /\b(?:id|targetMemberId|targetIdentityId)\s*:\s*`(?:unsupported:)?Tsonic\.CSharp\.Node\.[^`]*\$\{\s*(?:sourceName|sourceMemberName|exportName|memberName|targetName)\s*\}/g,
    replacement:
      "Node target member and unsupported target identities must be declared by provider metadata rows, not synthesized from source export/member names.",
  },
  {
    id: "nodejs-target-member-name-source-copy",
    filePattern: /(?:^|\/)surfaces\/nodejs\/.+\.ts$/,
    pattern: /(?<!\.)\b(?:sourceName|targetName)\s*(?::\s*(?:sourceName|sourceMemberName|exportName|memberName)\b|(?=\s*[,}]))/g,
    replacement:
      "Node target member source/target names must be explicit metadata fields; do not copy source export/member names into target member shape.",
  },
  {
    id: "nodejs-target-name-source-constant-copy",
    filePattern: /(?:^|\/)surfaces\/nodejs\/.+\.ts$/,
    pattern: /\btargetName\s*:\s*node[A-Za-z0-9]*(?:ExportName|MemberName)\b/g,
    replacement:
      "Node target member target names must be explicit target metadata, not copied from source export/member name constants.",
  },
  {
    id: "nodejs-target-id-signature-slice",
    filePattern: /(?:^|\/)surfaces\/nodejs\/.+\.ts$/,
    pattern: /\bsignatureId\.slice\s*\(/g,
    replacement:
      "Node target identity parameters must be declared as provider metadata, not extracted from source signature ids.",
  },
  {
    id: "nodejs-local-export-member-filter",
    filePattern: /(?:^|\/)surfaces\/nodejs\/.+\.ts$/,
    pattern: /\.filter\s*\(\s*\(?\s*(?:entry|member|row|candidate)\s*\)?\s*=>\s*(?:entry|member|row|candidate)\.(?:exportName|signatureId|memberName)\s*===/g,
    replacement:
      "Node provider declarations should be built from canonical provider metadata records instead of local export-name member filters.",
  },
  {
    id: "semantic-fallback-word",
    pattern: /\bfallback\b/gi,
    replacement:
      "Classify as harmless syntax fallback or replace semantic fallback with fail-closed diagnostics.",
  },
]);

export const analysisAbstractionFileRules = Object.freeze([
  {
    id: "policy-shaped-file",
    pattern: /(?:^|\/)[^/]+-policy\.ts$/,
    replacement:
      "Policy-shaped modules must either be pure declarative metadata awaiting migration to canonical provider rows or be renamed/rebuilt as generic selectors; executable semantic behavior is not allowed.",
  },
  {
    id: "procedural-policy-file",
    pattern: /(?:^|\/)(?:policy|selection-policy|property-policy|array-use-policy)\.ts$/,
    replacement:
      "Use named source-identity, rule, provider-metadata, selector, closed-fact, or exception modules; do not reintroduce procedural policy catch-alls.",
  },
  {
    id: "array-specific-use-classifier-file",
    pattern: /(?:^|\/)surfaces\/js\/array-carrier-lifecycle\/use-classification\.ts$/,
    replacement:
      "Move source-use discovery into the generic lazy analysis layer; array lifecycle planning must consume structural analysis records.",
  },
  {
    id: "collection-target-metadata-executable-policy-file",
    pattern: /(?:^|\/)collection-target-metadata\/[^/]+-policy\.ts$/,
    contentPattern: /\b(?:createOpenType|createClosedType|isTargetType|getIterableElementType)\s*:\s*(?:(?:\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>|[A-Za-z_$][\w$]*(?=\s*[,}]))/g,
    replacement:
      "Collection target metadata policy files must be pure metadata rows; executable selectors belong in generic provider/runtime selector implementations.",
  },
  {
    id: "provider-metadata-executable-selector-file",
    pattern: /(?:^|\/)provider-metadata\/[^/]+\.ts$/,
    contentPattern: /\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:\s*(?:(?:\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>|function\b|[A-Za-z_$][\w$]*(?=\s*[,}]))|\.(?:find|some)\s*\([\s\S]{0,240}\bsourceMember\b/g,
    replacement:
      "Provider metadata files must contain declarative rows only; executable source-member selectors belong in generic selector modules.",
  },
]);

export const analysisAbstractionDebtClassifications = Object.freeze([
  "source-identity-policy-candidate",
  "provider-metadata-candidate",
  "surface-policy-candidate",
  "type-classification-candidate",
  "object-shape-classification-candidate",
  "backend-fact-boundary-candidate",
  "explicit-exception-candidate",
  "delete-bug-candidate",
]);

export const analysisAbstractionDebtOwners = Object.freeze([
  "source-core-provider",
  "target-provider",
  "surface-provider",
  "csharp-backend",
  "csharp-runtime",
  "tests",
]);

export const analysisAbstractionDebtCatalog = Object.freeze([]);

export function collectAnalysisAbstractionFindings(repoRoot) {
  return sourceFiles(join(repoRoot, "src")).flatMap((filePath) => {
    const file = relative(repoRoot, filePath).split(sep).join("/");
    const text = readFileSync(filePath, "utf8");
    return collectAnalysisAbstractionFindingsForSource(file, text);
  });
}

export function collectAnalysisAbstractionFindingsForSource(file, text) {
  return [
    ...analysisAbstractionFileRules.flatMap((rule) => collectFileRuleFindings(file, text, rule)),
    ...analysisAbstractionRules.flatMap((rule) => collectRuleFindings(file, text, rule)),
  ];
}

export function summarizeAnalysisAbstractionFindings(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.file}\u0000${finding.ruleId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function collectRuleFindings(file, text, rule) {
  if (!ruleAppliesToFile(rule, file)) {
    return [];
  }
  rule.pattern.lastIndex = 0;
  return [...text.matchAll(rule.pattern)].map((match) => ({
    file,
    ruleId: rule.id,
    line: lineNumberAt(text, match.index ?? 0),
    snippet: lineAt(text, match.index ?? 0).trim(),
    replacement: rule.replacement,
  }));
}

function collectFileRuleFindings(file, text, rule) {
  rule.pattern.lastIndex = 0;
  if (!rule.pattern.test(file)) {
    return [];
  }
  if (rule.contentPattern === undefined) {
    return [{
        file,
        ruleId: rule.id,
        line: 1,
        snippet: file,
        replacement: rule.replacement,
      }];
  }
  rule.contentPattern.lastIndex = 0;
  return [...text.matchAll(rule.contentPattern)].map((match) => ({
    file,
    ruleId: rule.id,
    line: lineNumberAt(text, match.index ?? 0),
    snippet: lineAt(text, match.index ?? 0).trim(),
    replacement: rule.replacement,
  }));
}

function ruleAppliesToFile(rule, file) {
  if (rule.filePattern !== undefined) {
    rule.filePattern.lastIndex = 0;
    if (!rule.filePattern.test(file)) {
      return false;
    }
  }
  if (rule.allowedFilePattern !== undefined) {
    rule.allowedFilePattern.lastIndex = 0;
    if (rule.allowedFilePattern.test(file)) {
      return false;
    }
  }
  return true;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (text.charCodeAt(offset) === 10) {
      line += 1;
    }
  }
  return line;
}

function lineAt(text, index) {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entryName) => {
    const path = join(directory, entryName);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

function sourceIdentityMetadataFilePattern() {
  return /(?:^|\/)(?:source-identities\/[^/]+|source-library|source-identit(?:y|ies)|identities|identity-policies)\.ts$/;
}

function entry(file, counts, classification, owner, replacement) {
  return Object.freeze({
    file,
    counts: Object.freeze(counts),
    classification,
    owner,
    replacement,
    status: "migration-required",
  });
}
