// Carrier registry rows (kinds): test and audit data for this compiler only; product code never reads it.
export const kindsCarrierRegistry = Object.freeze([
  {
    id: "kind:array",
    kinds: ["array"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    responsibility: "kinds/array",
    frozen: false,
  },
  {
    id: "kind:function-pointer",
    kinds: ["function-pointer"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    responsibility: "kinds/function-pointer",
    frozen: false,
  },
  {
    id: "kind:opaque",
    kinds: ["opaque"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    responsibility: "kinds/opaque",
    frozen: false,
  },
  {
    id: "kind:pointer",
    kinds: ["pointer"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    responsibility: "kinds/pointer",
    frozen: false,
  },
  {
    id: "kind:source-primitive",
    kinds: ["source-primitive"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    responsibility: "kinds/source-primitive",
    frozen: false,
  },
  {
    id: "kind:target-named",
    kinds: ["target-named"],
    declaration: { module: "src/target-model/types/factories.ts", symbol: "csharpTargetNamedType" },
    responsibility: "kinds/target-named",
    frozen: false,
  },
  {
    id: "kind:tuple",
    kinds: ["tuple"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    responsibility: "kinds/tuple",
    frozen: false,
  },
  {
    id: "kind:type-parameter",
    kinds: ["type-parameter"],
    declaration: { module: "src/target-model/types/model.ts", symbol: "TargetTypeRef" },
    responsibility: "kinds/type-parameter",
    frozen: false,
  },
]);
