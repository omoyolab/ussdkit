import { UssdkitError } from "../errors.js";
import type { Gateway, UssdRequest } from "../types.js";

/*
 * Africa's Talking USSD callback format:
 * https://developers.africastalking.com/docs/ussd/overview
 *
 * Request: POST application/x-www-form-urlencoded with sessionId, serviceCode,
 * phoneNumber, text (every input so far joined by "*") and networkCode.
 * Response: text/plain body starting with "CON " to continue or "END " to finish.
 */

export interface AfricasTalkingRequest {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  text: string;
  networkCode?: string;
}

function field(body: Record<string, unknown>, name: string, required = true): string {
  const value = body[name];
  if (typeof value === "string") return value;
  if (value === undefined && !required) return "";
  throw new UssdkitError(
    `Africa's Talking request is missing "${name}"`,
    "Expected a form-encoded body with sessionId, serviceCode, phoneNumber and text",
  );
}

/** Splits Africa's Talking's `text` field into individual inputs. */
export function splitInputs(text: string): string[] {
  return text === "" ? [] : text.split("*");
}

export const africasTalking: Gateway<Record<string, unknown>, string> = {
  name: "africastalking",
  contentType: "text/plain; charset=utf-8",
  parse(body): UssdRequest {
    const inputs = splitInputs(field(body, "text", false));
    const network = field(body, "networkCode", false);
    return {
      sessionId: field(body, "sessionId"),
      phone: field(body, "phoneNumber"),
      serviceCode: field(body, "serviceCode"),
      input: inputs[inputs.length - 1] ?? "",
      inputs,
      network: network === "" ? undefined : network,
    };
  },
  format(response) {
    return `${response.end ? "END" : "CON"} ${response.text}`;
  },
};
