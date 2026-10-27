import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpTypedLocationStorage } from "./typed-location-storage.js";
import type { Node } from "@tsonic/tsts";

export type CsharpTypedLocationOperationSelection =
  | { readonly kind: "not-typed-location" }
  | {
      readonly kind: "rejected";
      readonly operation: CsharpTypedLocationOperationKind;
      readonly reason: string;
    }
  | CsharpResolvedTypedLocationOperation;

export type CsharpNativeRefReturnSelection =
  | {
      readonly kind: "resolved";
      readonly targetIdentity: string;
      readonly returnPassing: "byref-readwrite" | "byref-readonly";
      readonly returnType: TargetTypeRef | undefined;
    }
  | { readonly kind: "not-native" }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpTypedLocationOperationKind =
  | "location-address"
  | "location-allocate"
  | "location-load"
  | "location-store"
  | "location-equal"
  | "location-hash"
  | "location-bind"
  | "location-view"
  | "location-project";

export type CsharpResolvedTypedLocationOperation =
  | {
      readonly kind: "location-address";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly storage: CsharpTypedLocationStorage;
    }
  | {
      readonly kind: "location-allocate";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly initialExpression: Node;
    }
  | {
      readonly kind: "location-load";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly location: CsharpTypedLocationOperand;
    }
  | {
      readonly kind: "location-store";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly location: CsharpTypedLocationOperand;
      readonly valueExpression: Node;
    }
  | {
      readonly kind: "location-equal";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly parameterType: TargetTypeRef;
      readonly leftExpression: Node;
      readonly rightExpression: Node;
    }
  | {
      readonly kind: "location-hash";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly parameterType: TargetTypeRef;
      readonly locationExpression: Node;
    }
  | {
      readonly kind: "location-bind" | "location-project" | "location-view";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly method: "Bind" | "Project" | "ProjectOptional" | "View" | "ViewOptional";
      readonly typeArguments: readonly TargetTypeRef[];
      readonly arguments: readonly {
        readonly expression: Node;
        readonly type: TargetTypeRef;
      }[];
    };

export type CsharpTypedLocationOperand =
  | {
      readonly kind: "runtime-location";
      readonly expression: Node;
    }
  | {
      readonly kind: "native-ref-return";
      readonly expression: Node;
      readonly targetIdentity: string;
      readonly returnPassing: "byref-readwrite" | "byref-readonly";
    };
