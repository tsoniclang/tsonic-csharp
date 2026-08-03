export const csharpGeneratedHelperNamespace = "Tsonic.CSharp.Generated";
export const csharpGeneratedConversionHelperName = "__TsonicConversions";

export type CsharpGeneratedHelper =
  | "lifted-provider-argument-adapter";

export type CsharpGeneratedHelperRequestResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpGeneratedHelperRegistry {
  readonly revision: number;
  require(helper: CsharpGeneratedHelper): CsharpGeneratedHelperRequestResult;
  required(): readonly CsharpGeneratedHelper[];
}

const maximumGeneratedHelperCount = 64;

export function createCsharpGeneratedHelperRegistry():
  CsharpGeneratedHelperRegistry {
  const helpers = new Set<CsharpGeneratedHelper>();
  let revision = 0;

  function require(
    helper: CsharpGeneratedHelper,
  ): CsharpGeneratedHelperRequestResult {
    if (helpers.has(helper)) {
      return accepted;
    }
    if (helpers.size >= maximumGeneratedHelperCount) {
      return {
        kind: "rejected",
        reason:
          `C# generated helpers exceed their finite ${maximumGeneratedHelperCount}-helper budget.`,
      };
    }
    helpers.add(helper);
    revision += 1;
    return accepted;
  }

  return Object.freeze({
    get revision(): number {
      return revision;
    },
    require,
    required(): readonly CsharpGeneratedHelper[] {
      return Object.freeze(
        [...helpers].sort((left, right) => left.localeCompare(right)),
      );
    },
  });
}

const accepted = Object.freeze({ kind: "accepted" as const });
