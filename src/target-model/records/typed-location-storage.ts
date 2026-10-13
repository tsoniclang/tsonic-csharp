import type { TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export type CsharpTypedLocationStorageSelection =
  | { readonly kind: "resolved"; readonly storage: CsharpTypedLocationStorage }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpTypedLocationStorage =
  | {
      readonly kind: "direct-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly identity: CsharpTypedLocationDirectIdentity;
    }
  | {
      readonly kind: "reference-property-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly memberIdentity: string;
    }
  | {
      readonly kind: "value-property-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly memberIdentity: string;
      readonly receiverStorage: CsharpTypedLocationStorage;
    }
  | {
      readonly kind: "reference-element-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
    }
  | {
      readonly kind: "reference-indexed-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly receiverType: TargetTypeRef;
      readonly indexType: TargetTypeRef;
      readonly method: string;
    };

export type CsharpTypedLocationDirectIdentity =
  | {
      readonly kind: "local-storage";
      readonly declaration: Node;
    }
  | {
      readonly kind: "static-storage";
      readonly identity: string;
    }
  | {
      readonly kind: "instance-member-storage";
      readonly memberIdentity: string;
    };
