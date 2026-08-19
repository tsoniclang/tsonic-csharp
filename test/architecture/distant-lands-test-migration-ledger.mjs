export const replacementContracts = Object.freeze({
  "provider-relations": contract(
    `import { Console } from "@tsonic/dotnet/System.js";\nConsole.WriteLine("ready");`,
    [
      "test/integration/provider-selection/direct-provider-call-selection-relations-and-conversions.test.mjs",
      "test/integration/provider-selection/direct-provider-member-selection.test.mjs",
      "test/providers/relations/direct-provider-relations.test.mjs",
      "test/providers/dotnet/target-bindings/dotnet-provider-members-and-cross-module-bindings.test.mjs",
      "../tsonic/test/cli-build/providers/dotnet/core.test.mjs",
    ],
  ),
  "contextual-translation": contract(
    `function identity<T>(value: T): T { return value; }\nconst value = identity<int32>(1);`,
    [
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "test/backend/planner/artifacts/direct-translation-artifacts.test.mjs",
      "../tsonic/test/cli-build/providers/tsts-type-forms/core.test.mjs",
    ],
  ),
  bindings: contract(
    `const [head, ...tail] = values;\nconst { name, ...rest } = user;`,
    [
      "test/backend/planner/statements/direct-translation-bindings.test.mjs",
      "test/policy/types/direct-binding-projection-policy.test.mjs",
      "../tsonic/test/cli-build/core/arrays/destructuring-tuples.test.mjs",
      "../tsonic/test/cli-build/core/control-flow/binding-destructure.test.mjs",
    ],
  ),
  declarations: contract(
    `class Box<T> { constructor(readonly value: T) {} }\nclass TextBox extends Box<string> {}`,
    [
      "test/backend/planner/declarations/direct-translation-declarations.test.mjs",
      "test/backend/planner/declarations/direct-translation-inheritance-generics.test.mjs",
      "test/backend/planner/declarations/direct-translation-inheritance-constructors.test.mjs",
      "../tsonic/test/cli-build/core/declarations/generics-interfaces.test.mjs",
    ],
  ),
  compat: contract(
    `declare const value: any;\nconst result = value.child(1)["name"];`,
    [
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "../tsonic/test/cli-build/runtime/compatibility/runtime.test.mjs",
      "../tsonic/test/cli-build/core/control-flow/rejections.test.mjs",
    ],
  ),
  "js-surface": contract(
    `const values = [1, 2].map((value) => value + 1);\nconsole.log(JSON.stringify(values));`,
    [
      "../tsonic/test/cli-build/runtime/js-surface/arrays.test.mjs",
      "../tsonic/test/cli-build/runtime/js-surface/math-console-json.test.mjs",
      "../tsonic/test/cli-build/runtime/js-surface/number-boolean.test.mjs",
      "../tsonic/test/cli-build/runtime/js-surface/objects-records-iteration.test.mjs",
      "../tsonic/test/cli-build/runtime/js-surface/strings-regexp-date.test.mjs",
      "../tsonic/test/cli-build/runtime/js-surface/rejections.test.mjs",
    ],
  ),
  "object-shapes": contract(
    `interface User { name: string; }\nconst user: User = { name: "Ada" };\nconst copy = { ...user };`,
    [
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "../tsonic/test/cli-build/core/object-shapes/basic.test.mjs",
      "../tsonic/test/cli-build/core/object-shapes/generated-carriers.test.mjs",
      "../tsonic/test/cli-build/core/object-shapes/spread-record.test.mjs",
      "../tsonic/test/cli-build/core/object-shapes/rejections.test.mjs",
    ],
  ),
  "operators-control": contract(
    `values[index++] += next();\nfor (const value of values) { if (value > 0) break; }`,
    [
      "../tsonic/test/cli-build/core/control-flow/expressions.test.mjs",
      "../tsonic/test/cli-build/core/control-flow/functions-this-async.test.mjs",
      "../tsonic/test/cli-build/core/control-flow/statements.test.mjs",
      "../tsonic/test/cli-build/runtime/language/nullish-flow.test.mjs",
    ],
  ),
  iteration: contract(
    `for (const item of values) { consume(item); }\nfor (const key in record) { consume(key); }`,
    [
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "../tsonic/test/cli-build/runtime/iteration/facts.test.mjs",
      "../tsonic/test/cli-build/runtime/js-surface/objects-records-iteration.test.mjs",
    ],
  ),
  "source-core": contract(
    `const zero = defaultof<int32>();\nattribute<ObsoleteAttribute>().apply();`,
    [
      "test/source/markers/direct-source-core-translation.test.mjs",
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "test/providers/dotnet/target-bindings/dotnet-provider-attributes.test.mjs",
      "../tsonic/test/cli-build/providers/source-semantics/core.test.mjs",
      "../tsonic/test/cli-build/providers/dotnet/delegates-attributes-exceptions.test.mjs",
    ],
  ),
  "types-conversions": contract(
    `const dog = animal as Dog;\nconst value: string | int32 = condition ? "x" : 1;`,
    [
      "test/policy/conversions/direct-source-literal-policy.test.mjs",
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "test/backend/planner/declarations/direct-translation-declarations.test.mjs",
      "test/providers/dotnet/target-bindings/dotnet-provider-generic-constraints.test.mjs",
      "../tsonic/test/cli-build/providers/dotnet/constraints-conversions.test.mjs",
      "../tsonic/test/cli-build/runtime/unions/runtime-union.test.mjs",
    ],
  ),
  "source-profiles": contract(
    `const clr = path.Split("/");\nconst js = path.split("/");`,
    [
      "test/integration/source-profile/source-profile-contract.test.mjs",
      "../tsonic/test/cli-build/providers/source-profile/contract.test.mjs",
      "../tsonic/test/cli-build/runtime/js-surface/rejections.test.mjs",
    ],
  ),
  diagnostics: contract(
    `declare const value: any;\nvalue.child;`,
    [
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "test/architecture/native-product-boundary.test.mjs",
      "../tsonic/test/cli-build/core/control-flow/rejections.test.mjs",
      "../tsonic/test/cli-build/providers/dotnet/rejections.test.mjs",
    ],
  ),
  "deleted-target-fact-architecture": contract(
    `const parts = path.Split("/");\nConsole.WriteLine(parts.Length);`,
    [
      "test/architecture/analysis-abstraction-policy.test.mjs",
      "test/architecture/selected-evidence-audit.test.mjs",
      "test/backend/planner/expressions/direct-translation-core.test.mjs",
      "../tsonic/test/architecture/dependency-boundaries.test.mjs",
      "../tsonic/test/source-core/selected-evidence-audit.test.mjs",
    ],
  ),
});

export const obsoleteTargetFactTests = Object.freeze([
  row("test/array-carrier-policy.test.mjs", 2, "f10534482468a065d2f7993f0ce4da8b5402ad1eadd0d9488b1d52dc5a733537", ["types-conversions", "bindings", "js-surface"]),
  row("test/assignability-boundary.test.mjs", 12, "17946a38a13ff7cfff0fd25dce50beb18ccadc564824b08da9496c73b96d6018", ["types-conversions", "provider-relations", "diagnostics"]),
  row("test/attributes.test.mjs", 4, "6d0b7d672e017a4231c6ceb3dd3c7b691ec5a40956db9669e56672f4ce857840", ["source-core", "declarations", "diagnostics"]),
  row("test/backend-diagnostics.test.mjs", 2, "9e825c355f4b7cecd8dd008dec8780610bae24a182de205a08a0a73577bde449", ["diagnostics", "deleted-target-fact-architecture"]),
  row("test/binding-patterns-part-02-tuple-rest-destructuring-emits-one-element-syste.test.mjs", 6, "9c8fc37b2d4fe63bb43ef7623312264ff73d1c988b6a8351554cfcab37b959bb", ["bindings"]),
  row("test/binding-patterns-part-03-array-destructuring-over-provider-read-only-inde.test.mjs", 7, "516346b398f594156ce2012349957db95c0a1dd30692272ac4cf9fd60526e7ff", ["bindings", "provider-relations", "object-shapes"]),
  row("test/binding-patterns-part-04-object-destructuring-defaults-fail-closed-for-op.test.mjs", 1, "ec3887f87de60b871606eaa9d9cc4d98040e59ca232ac487942aeafd8daf43e4", ["bindings", "diagnostics"]),
  row("test/binding-patterns.test.mjs", 9, "ea83428106d3c559122759e6b81d27375cfd679eb989adecac1efae439b6f881", ["bindings", "object-shapes", "diagnostics"]),
  row("test/call-operation-facts.helpers.mjs", 0, "703834613e0e008f0940cc61301043539e53ec2714ed909879cf244afab71615", ["deleted-target-fact-architecture"]),
  row("test/call-operation-facts.test.mjs", 30, "05b7ad83b9decfca9b9e8b7eac4edb92913f6d1eabb4943597972a144a843852", ["provider-relations", "contextual-translation", "types-conversions", "deleted-target-fact-architecture"]),
  row("test/checked-operation-finalization-ownership.test.mjs", 2, "bcc65f3679992c28d489a16bc72d7b012fa30db54dc649e72cebccb9df3b5350", ["contextual-translation", "deleted-target-fact-architecture"]),
  row("test/compat-runtime-planner.test.mjs", 16, "f081889417519d85049b0265c15f1deef592a84f5993e167fb38bbfaac8afe42", ["compat", "deleted-target-fact-architecture"]),
  row("test/compat-runtime.helpers.mjs", 1, "b678c76dbaa4ca190e07bcc706cd8e49189c3b4ebfbaab14296e4086525efe21", ["compat", "deleted-target-fact-architecture"]),
  row("test/compat-runtime.test.mjs", 21, "b8cc780b21a2a434c81fefa3cb111b8aadd2dd5c077ee9b694184542e10baaa1", ["compat", "diagnostics"]),
  row("test/conversions.test.mjs", 13, "03779f09d673e6dddedfd715d9ecf3aaf669399f67a4c556716e3526ebe2b11c", ["types-conversions", "provider-relations", "deleted-target-fact-architecture"]),
  row("test/csharp-runtime-carrier-facts.test.mjs", 13, "1912c9077e30aa5de80a0c530976685a236b9e85975f1bf3524add29c1d408f9", ["types-conversions", "contextual-translation", "deleted-target-fact-architecture"]),
  row("test/declaration-classes.test.mjs", 11, "930a8a2044e3cf59b2dcf70d6f44f0cb16c40263ab2e7dfc4a3b6bf54c9e2dc3", ["declarations", "operators-control", "diagnostics"]),
  row("test/declaration-generics.test.mjs", 3, "82b11da7c6c05019a00b0b75bf468748bebd2a59f167678e57a8c464813a61e9", ["declarations", "types-conversions"]),
  row("test/iteration-selection.test.mjs", 3, "ffc884a394393d7e808cb7f62fded0ac83249bddbeac8538c6c00975a46f7f33", ["iteration", "provider-relations"]),
  row("test/js-global-source-profile.test.mjs", 2, "9c7011436ce42f158fdb3c616a5bdfabfe842e433102c885bf52103beacf4461", ["js-surface", "source-profiles"]),
  row("test/js-surface-completion.test.mjs", 8, "6e7077d4f88c9982070c606c253ae83a2a16a8838f3167f67d66f8262313ea47", ["js-surface", "diagnostics"]),
  row("test/json-object-shape-lifecycle.test.mjs", 3, "71d84c6d91b8b0af0c969d4423cf36f71e9c21ab438cda1839dcd995b7820b24", ["object-shapes", "js-surface", "deleted-target-fact-architecture"]),
  row("test/object-shape-boundary-part-02-object-shape-method-object-literals-require-dele.test.mjs", 6, "89b03aea05744ada39780a547f3cdc1102089e9663fa3d0226eacce6119941dd", ["object-shapes", "types-conversions", "diagnostics"]),
  row("test/object-shape-boundary.helpers.mjs", 0, "8415ea1c547e0626fb4759d294b3de48ec556d5ee470bf199813d6ae088662f2", ["object-shapes", "deleted-target-fact-architecture"]),
  row("test/object-shape-boundary.test.mjs", 21, "2e8e8f31b542cbe2547bf369c11e1c44401a77f84c63b726b3db2b94860bc30e", ["object-shapes", "provider-relations", "types-conversions", "diagnostics"]),
  row("test/operator-facts-part-02-await-expression-emission-uses-finalized-promise.test.mjs", 13, "468325440c73c2c43d8fb81d2edadd46ad84b6300a2d26caa3065456f974b1a2", ["operators-control", "types-conversions", "object-shapes"]),
  row("test/operator-facts.helpers.mjs", 0, "17084bab3cee07067de81702e79b835c395c37c9b5c2d272a1510d4e07ee4abc", ["operators-control", "deleted-target-fact-architecture"]),
  row("test/operator-facts.test.mjs", 33, "97e2e7818c2ffc3123315bf758dcebf2ec73f8bcd8f6266c97398f6337d3bd10", ["operators-control", "types-conversions", "provider-relations", "diagnostics"]),
  row("test/provider-conversion-operators.test.mjs", 19, "6f72f08c588f91908dbfd2dde8a42374bc67bb9914f047093d1b3a74b5f2a657", ["provider-relations", "types-conversions", "diagnostics"]),
  row("test/provider-selection.helpers.mjs", 0, "1a5b07bedcc6c595ba02a5376031f841dd37f1b635248d84d937d960763031d4", ["provider-relations", "deleted-target-fact-architecture"]),
  row("test/runtime-union.test.mjs", 9, "aa7df991a00767ec0f49d35eb4fe1232f70b5d0ea9dd1827289b7fb7583ce683", ["types-conversions", "contextual-translation"]),
  row("test/semantic-guards.test.mjs", 16, "3aad7e1ece6e6ec99c5644f15ec93b21aa2f2c6623c6d84037671dbd4cf29627", ["diagnostics", "deleted-target-fact-architecture"]),
  row("test/source-evidence-reconciliation.test.mjs", 8, "3296311edb3f95dee8ba657d3966b22347ccfa82b3662aa8732d288332ee47ab", ["types-conversions", "contextual-translation", "diagnostics"]),
  row("test/source-library-classification.test.mjs", 2, "d8144da765b2d8b4d180654e80296ef33218b52749ba67c7c0d2927fcf11bc0d", ["js-surface", "source-profiles"]),
  row("test/source-owned-call-closure.test.mjs", 14, "8895dff86c8c156548f44a341d633135500cc1ab770d90485308b12b75196179", ["contextual-translation", "types-conversions", "diagnostics"]),
  row("test/source-owned-lifecycle-coverage.test.mjs", 2, "20e80204254ee140de0271df056ad8adb5dd0398ffda0187ed382124abcfe337", ["contextual-translation", "deleted-target-fact-architecture"]),
  row("test/source-semantics-part-02-source-semantics-closes-generic-structural-objec.test.mjs", 14, "ae270a25976a2f5704c8338c55b0e51c3365de7b6f3192f14766a59492d5781d", ["contextual-translation", "object-shapes", "types-conversions"]),
  row("test/source-semantics-part-03-source-semantics-records-pointer-marker-facts-fr.test.mjs", 14, "79044025a0213b36747137c4b5beec220356178402edc6a6f1eb53081522567b", ["source-core", "types-conversions", "contextual-translation"]),
  row("test/source-semantics-part-04-source-semantics-records-nested-object-rest-fact.test.mjs", 2, "27f38bba6c3eba402f7b41a1c4b773b280fa19f30d1165123ee78aaf4b5765dc", ["object-shapes", "bindings"]),
  row("test/source-semantics.helpers.mjs", 0, "32c00d89a14f955990236e8a0be584b865e96fbbfdcc6e0f65f98adef2ecc151", ["contextual-translation", "deleted-target-fact-architecture"]),
  row("test/source-semantics.test.mjs", 10, "4fe31b6cd927ca3124a4dfb2aaf4507306368b3edcb549767a6089ef86e23eef", ["source-core", "contextual-translation", "types-conversions"]),
  row("test/statement-planner-part-02-array-destructuring-assignment-statements-emit-s.test.mjs", 10, "d1e2387c434e6947c39e9b0560570048e58bd60c1395630c0ce950d241aad8c6", ["bindings", "operators-control", "diagnostics"]),
  row("test/statement-planner-part-03-object-shape-destructuring-assignment-defaults-u.test.mjs", 10, "a13ef58b54f97d3f9706e89daa5db6633f8b38561133833482ebb9cab0b3d91b", ["bindings", "object-shapes", "operators-control", "diagnostics"]),
  row("test/statement-planner.helpers.mjs", 0, "05bdb8a4bc7553be1767c72d2be633d0cddbee8ee622f3bdb2d59c236413d291", ["operators-control", "deleted-target-fact-architecture"]),
  row("test/statement-planner.test.mjs", 25, "999aca0c35c500e893fffe773897c3a00e5bf5e8ea7f2b3c30492b2c4fc27603", ["operators-control", "iteration", "bindings", "diagnostics"]),
  row("test/surface-boundary-part-02-js-surface-maps-number-static-methods-and-consta.test.mjs", 28, "d748de4b0a6ccfb3fcd890f5fadfeed883196e26f042278b23f70d91eb3d5b05", ["js-surface", "types-conversions", "diagnostics"]),
  row("test/surface-boundary-part-03-js-surface-maps-json-parse-from-selected-standar.test.mjs", 33, "0e4797edb9bcb803ce94ee0aa98fee5cc8e581ae83e6a9c32067fc6a14f65ee3", ["js-surface", "object-shapes", "operators-control", "diagnostics"]),
  row("test/surface-boundary-part-04-js-surface-maps-object-assign-only-from-selected.test.mjs", 33, "0d1d6cd40e54cbe9c8a0f1900b37c41b2351acd32d283fd8e9b7dbb179f08b71", ["js-surface", "object-shapes", "iteration", "diagnostics"]),
  row("test/surface-boundary.helpers.mjs", 0, "4d9e7e232e1d1cf8b5fc46d867c3d5a27a67b6fb7cbc0037d3a93af5680ce693", ["js-surface", "deleted-target-fact-architecture"]),
  row("test/surface-boundary.test.mjs", 38, "9b1ee1ccf4e8246c4a0d870b0bf0f0e9fe34d24e51547f40c623f422d70cae98", ["js-surface", "types-conversions", "provider-relations", "diagnostics"]),
  row("test/target-capability-contributions.test.mjs", 4, "22f427f3cdaa51637d868cc1e7457ce993f6ba26bca68301c02ea62fabc88d4e", ["provider-relations", "source-profiles", "diagnostics"]),
  row("test/target-type-facts.test.mjs", 21, "1eff66c00a85d7f2987099e0374edbc646da3e508cd93c89b45eea156b72a8a7", ["types-conversions", "source-core", "provider-relations", "diagnostics"]),
  row("test/target-type-resolution-cache.test.mjs", 1, "70f35980b6e85ac2d687a3c04228258ae9b6cde249dfa1ef517b5b655e525ffb", ["contextual-translation", "deleted-target-fact-architecture"]),
  row("test/provider-source-classification.test.mjs", 3, "fd4777e972a03b86e3d62cde8a7fd6f496e8171f6374378c3ef10cb826db92d1", ["provider-relations", "deleted-target-fact-architecture"]),
  row("test/array-spread-boundary-part-02-native-collection-spread-accepts-tuple-carriers.test.mjs", 4, "9bdf4d17a50f679da1ee9d4fd9798e365944cfcf5a6b10171fda0541ff7ea51d", ["bindings", "types-conversions"]),
  row("test/array-spread-boundary.test.mjs", 12, "8ea5838b3d17dde4104590ce66e14eb213f7114c11267652cc7980e4c813e0d5", ["bindings", "types-conversions", "js-surface", "diagnostics"]),
  row("test/checked-operator-performance.test.mjs", 1, "edd72e2c97694bc71c3ff94fbe7b3c216e42a6d0a6b0143e7b16e3aaab8eed5c", ["operators-control", "deleted-target-fact-architecture"]),
  row("test/core-lang-planner.test.mjs", 7, "f1f17a387ce35c690f09a32833ef4c238283fea60d63f4027a7dd3f8e05da8ae", ["source-core", "types-conversions", "diagnostics"]),
  row("test/entrypoint-planner.test.mjs", 4, "4f4ce6e84c489868b4c1e87fb1261016f4df299d74447cb219da56f4dfcf9796", ["contextual-translation", "operators-control", "diagnostics"]),
  row("test/module-graph.test.mjs", 4, "4a281dde4ee5cfe194f1d708f6bcb26399db351f16e561b8a4e9fd94d0838814", ["contextual-translation", "deleted-target-fact-architecture", "diagnostics"]),
  row("test/source-output-identity.test.mjs", 5, "f3a2320379fadb8bde311eb70e4ac2e5939fc961183a694935ed3b8a9151c6d3", ["contextual-translation", "diagnostics"]),
  row("test/value-types.test.mjs", 3, "439cd60d90c7ee50641a0762b19209d6ba6bec30f54a5a28151286d34ddfafee", ["source-core", "declarations", "types-conversions"]),
]);

function contract(example, proofs) {
  return Object.freeze({ example, proofs: Object.freeze([...proofs]) });
}

function row(path, testCount, sha256, contracts) {
  return Object.freeze({
    path,
    testCount,
    sha256,
    contracts: Object.freeze([...contracts]),
  });
}
