import type { CsharpProjectTypeHeritage } from "../../target-model/records/types/project-types.js";
import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";

export function completeCsharpDeclarationHeritage(
  heritage: CsharpProjectTypeHeritage,
  shape: CsharpObjectShapeFact | undefined,
): CsharpProjectTypeHeritage {
  const interfaces = new Map(heritage.interfaces.map(type => [targetTypeRefKey(type), type]));
  for (const type of shape?.implements ?? []) interfaces.set(targetTypeRefKey(type), type);
  return Object.freeze({ ...heritage, interfaces: Object.freeze([...interfaces.values()]) });
}
