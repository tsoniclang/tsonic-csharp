import type { TargetCarrierRegistryEntry } from "@tsonic/target-api";
import type { TargetTypeRef } from "../model.js";

export const kindsCarrierRegistry: readonly TargetCarrierRegistryEntry<TargetTypeRef["kind"]>[] = Object.freeze([
  {
    id: "kind:array",
    kinds: ["array"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
  {
    id: "kind:function-pointer",
    kinds: ["function-pointer"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
  {
    id: "kind:opaque",
    kinds: ["opaque"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
  {
    id: "kind:pointer",
    kinds: ["pointer"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
  {
    id: "kind:source-primitive",
    kinds: ["source-primitive"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
  {
    id: "kind:target-named",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/factories.ts", symbol: "csharpTargetNamedType" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
  {
    id: "kind:tuple",
    kinds: ["tuple"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
  {
    id: "kind:type-parameter",
    kinds: ["type-parameter"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    counterpart: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    frozen: false,
  },
]);
