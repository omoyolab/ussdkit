import { describe, expect, it } from "vitest";

import { UssdkitError } from "../src/errors.js";
import { africasTalking, splitInputs } from "../src/gateways/africastalking.js";

describe("africasTalking gateway", () => {
  it("parses a first request", () => {
    expect(
      africasTalking.parse({
        sessionId: "s1",
        serviceCode: "*384#",
        phoneNumber: "+254700000000",
        text: "",
      }),
    ).toEqual({
      sessionId: "s1",
      phone: "+254700000000",
      serviceCode: "*384#",
      input: "",
      inputs: [],
      network: undefined,
    });
  });

  it("parses replayed inputs and the network code", () => {
    const parsed = africasTalking.parse({
      sessionId: "s1",
      serviceCode: "*384#",
      phoneNumber: "+254700000000",
      text: "1*500*",
      networkCode: "63902",
    });
    expect(parsed.inputs).toEqual(["1", "500", ""]);
    expect(parsed.input).toBe("");
    expect(parsed.network).toBe("63902");
  });

  it("formats CON and END", () => {
    expect(africasTalking.format({ text: "Hi\n1. Go", end: false })).toBe("CON Hi\n1. Go");
    expect(africasTalking.format({ text: "Bye", end: true })).toBe("END Bye");
    expect(africasTalking.contentType).toMatch(/text\/plain/);
  });

  it("rejects bodies missing required fields", () => {
    expect(() => africasTalking.parse({ text: "" })).toThrow(UssdkitError);
    expect(() => africasTalking.parse({ text: "" })).toThrow(/sessionId/);
  });

  it("splitInputs", () => {
    expect(splitInputs("")).toEqual([]);
    expect(splitInputs("1")).toEqual(["1"]);
    expect(splitInputs("1*2*3")).toEqual(["1", "2", "3"]);
  });
});
