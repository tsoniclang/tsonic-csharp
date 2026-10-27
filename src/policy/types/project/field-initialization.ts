import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpClassFieldInitialization } from "../../../target-model/records/objects/class-initialization.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";

export function selectCsharpFieldInitialization(carrier: TargetTypeRef): CsharpClassFieldInitialization {
  return Object.freeze({ nullForgiving: !isCsharpValueTypeTargetType(carrier) &&
    getCsharpNullableElementTargetType(carrier) === undefined });
}
