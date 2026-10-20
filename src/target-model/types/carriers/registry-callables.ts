import type { TargetCarrierRegistryEntry } from "@tsonic/target-api";
import type { TargetTypeRef } from "../model.js";

export const callablesCarrierRegistry: readonly TargetCarrierRegistryEntry<TargetTypeRef["kind"]>[] = Object.freeze([
  {
    id: "src/target-model/types/carriers/class-factories.ts#csharpClassFactoryTargetType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/carriers/class-factories.ts", symbol: "csharpClassFactoryTargetType" },
    counterpart: { module: "src/target-model/types/carriers/class-constructors.ts", symbol: "rustClassConstructorTargetType" },
    frozen: false,
  },
  {
    id: "src/target-model/types/carriers/delegates.ts#csharpDelegateTargetType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/carriers/delegates.ts", symbol: "csharpDelegateTargetType" },
    counterpart: { module: "src/target-model/types/carriers/callables.ts", symbol: "rustCallableTargetType" },
    frozen: false,
  },
  {
    id: "src/target-model/types/carriers/delegates.ts#csharpTaskTargetType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/carriers/delegates.ts", symbol: "csharpTaskTargetType" },
    counterpart: { module: "src/target-model/types/carriers/promises.ts", symbol: "rustJsPromiseTargetType" },
    frozen: false,
  },
  {
    id: "src/target-model/types/carriers/generators.ts#csharpGeneratorTargetType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/carriers/generators.ts", symbol: "csharpGeneratorTargetType" },
    counterpart: { module: "src/target-model/types/carriers/callables.ts", symbol: "rustGeneratorTargetType" },
    frozen: false,
  },
  {
    id: "src/target-model/types/carriers/generators.ts#csharpAsyncGeneratorTargetType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/carriers/generators.ts", symbol: "csharpAsyncGeneratorTargetType" },
    counterpart: { module: "src/target-model/types/carriers/callables.ts", symbol: "rustAsyncGeneratorTargetType" },
    frozen: false,
  },
  {
    id: "src/target-model/types/carriers/generators.ts#csharpIteratorResultTargetType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/carriers/generators.ts", symbol: "csharpIteratorResultTargetType" },
    counterpart: { module: "src/target-model/types/carriers/callables.ts", symbol: "rustIteratorResultTargetType" },
    frozen: false,
  },
  {
    id: "src/target-model/types/carriers/generators.ts#csharpAsyncEnumerableTargetType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/carriers/generators.ts", symbol: "csharpAsyncEnumerableTargetType" },
    counterpart: { module: "src/target-model/types/carriers/callables.ts", symbol: "rustAsyncGeneratorTargetType" },
    frozen: false,
  },
  {
    id: "src/policy/types/callables/generators.ts#closeCsharpGeneratorProtocolType",
    kinds: ["array", "function-pointer", "opaque", "pointer", "source-primitive", "target-named", "tuple", "type-parameter"],
    declaration: { module: "src/policy/types/callables/generators.ts", symbol: "closeCsharpGeneratorProtocolType" },
    counterpart: { module: "src/target-model/types/carriers/native.ts", symbol: "rustUnitTargetType" },
    frozen: false,
  },
  {
    id: "src/target-model/types/method-values.ts#csharpMethodValueType",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/method-values.ts", symbol: "csharpMethodValueType" },
    counterpart: { module: "src/policy/types/objects/member-storage.ts", symbol: "rustStructuralMethodStorageCarrier" },
    frozen: true,
  },
  {
    id: "src/policy/types/callables/method-values.ts#rebindCsharpMethodValueTypeParameters",
    kinds: ["target-named"],
    declaration: { module: "src/policy/types/callables/method-values.ts", symbol: "rebindCsharpMethodValueTypeParameters" },
    counterpart: { module: "src/policy/types/callables/method-values.ts", symbol: "rebindRustCallableCarrier" },
    frozen: true,
  },
]);
