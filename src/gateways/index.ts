import type { Gateway } from "../types.js";
import { africasTalking } from "./africastalking.js";

export { africasTalking, splitInputs } from "./africastalking.js";
export type { AfricasTalkingRequest } from "./africastalking.js";

export const gateways: Record<string, Gateway<Record<string, unknown>, string>> = {
  africastalking: africasTalking,
};
