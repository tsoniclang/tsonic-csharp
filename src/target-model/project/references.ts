export type CsharpProjectReference =
  | { readonly kind: "project"; readonly include: string }
  | {
      readonly kind: "package";
      readonly include: string;
      readonly version?: string;
      readonly privateAssets?: string;
      readonly includeAssets?: string;
    }
  | { readonly kind: "framework"; readonly include: string }
  | {
      readonly kind: "assembly";
      readonly include: string;
      readonly hintPath?: string;
    };
