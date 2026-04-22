import { describe, it, expect } from "vitest";
import { parseTrigger, serializeTrigger, hasEscalationTarget, slaUrgency } from "./escalationRule";

describe("parseTrigger — importer format (prefixed lines)", () => {
  it("parses a full four-field block", () => {
    const input = [
      "Billing",
      "Keywords: invoice, payment, refund",
      "To: finance@pairai.com",
      "SLA: 2h",
      "Script: We have received your request and will respond shortly.",
    ].join("\n");

    expect(parseTrigger(input)).toEqual({
      category: "Billing",
      keywords: "invoice, payment, refund",
      escalationTarget: "finance@pairai.com",
      slaHours: 2,
      autoResponse: "We have received your request and will respond shortly.",
    });
  });

  it("tolerates windows line endings and extra whitespace", () => {
    const input =
      "Support\r\n\r\n  Keywords:  urgent,outage  \r\n  To: oncall@pairai.com\r\nSLA:  30 minutes  \r\n";
    const parsed = parseTrigger(input);
    expect(parsed.category).toBe("Support");
    expect(parsed.keywords).toBe("urgent,outage");
    expect(parsed.escalationTarget).toBe("oncall@pairai.com");
    expect(parsed.slaHours).toBeCloseTo(0.5);
  });

  it("is case-insensitive on prefix keys", () => {
    const input = ["Ops", "KEYWORDS: foo", "to: ops@x.com"].join("\n");
    const parsed = parseTrigger(input);
    expect(parsed.keywords).toBe("foo");
    expect(parsed.escalationTarget).toBe("ops@x.com");
  });

  it("returns empty structure for empty string", () => {
    expect(parseTrigger("")).toEqual({
      category: "",
      keywords: "",
      escalationTarget: "",
      slaHours: null,
      autoResponse: "",
    });
  });
});

describe("parseTrigger — prose format", () => {
  it("parses the canonical prose shape", () => {
    const input =
      "Billing - invoice, refund. Escalate to finance@pairai.com. SLA: 2h. Auto: Ack received.";
    expect(parseTrigger(input)).toEqual({
      category: "Billing",
      keywords: "invoice, refund",
      escalationTarget: "finance@pairai.com",
      slaHours: 2,
      autoResponse: "Ack received",
    });
  });

  it("handles 'Handled by X. No escalation needed.' with no target", () => {
    const input = "General - greetings. Handled by bot. No escalation needed.";
    const parsed = parseTrigger(input);
    expect(parsed.category).toBe("General");
    expect(parsed.keywords).toBe("greetings");
    expect(parsed.escalationTarget).toBe("");
    expect(parsed.slaHours).toBeNull();
  });

  it("parses minutes in SLA", () => {
    const input = "Ops - outage. Escalate to oncall@x.com. SLA: 30 minutes. Auto: Paging oncall.";
    const parsed = parseTrigger(input);
    expect(parsed.slaHours).toBeCloseTo(0.5);
  });

  it("drops trailing periods from autoResponse", () => {
    const input = "Test - test. Escalate to a@b.com. SLA: 1h. Auto: Done.";
    expect(parseTrigger(input).autoResponse).toBe("Done");
  });

  it("handles 'Escalates to' variant", () => {
    const input = "Tech - bug. Escalates to eng@x.com. SLA: 4h. Auto: Logged.";
    expect(parseTrigger(input).escalationTarget).toBe("eng@x.com");
  });
});

describe("serializeTrigger", () => {
  it("round-trips a full record to importer format", () => {
    const parsed = parseTrigger(
      "Billing - invoice. Escalate to finance@x.com. SLA: 2h. Auto: Ack.",
    );
    const serialised = serializeTrigger(parsed);
    expect(serialised.split("\n")).toEqual([
      "Billing",
      "Keywords: invoice",
      "To: finance@x.com",
      "SLA: 2h",
      "Script: Ack",
    ]);
  });

  it("omits empty fields", () => {
    const out = serializeTrigger({
      category: "General",
      keywords: "",
      escalationTarget: "",
      slaHours: null,
      autoResponse: "",
    });
    expect(out).toBe("General");
  });

  it("formats fractional SLA hours compactly", () => {
    const out = serializeTrigger({
      category: "X",
      keywords: "y",
      escalationTarget: "z@x.com",
      slaHours: 0.5,
      autoResponse: "",
    });
    expect(out).toContain("SLA: 0.5h");
  });

  it("parseTrigger(serializeTrigger(x)) is a fixed point for well-formed data", () => {
    const src = {
      category: "Billing",
      keywords: "invoice, refund",
      escalationTarget: "finance@pairai.com",
      slaHours: 2,
      autoResponse: "Ack received",
    };
    expect(parseTrigger(serializeTrigger(src))).toEqual(src);
  });
});

describe("hasEscalationTarget", () => {
  it("returns true only when target is non-empty after trim", () => {
    expect(
      hasEscalationTarget({
        category: "",
        keywords: "",
        escalationTarget: "x@y.com",
        slaHours: null,
        autoResponse: "",
      }),
    ).toBe(true);
    expect(
      hasEscalationTarget({
        category: "",
        keywords: "",
        escalationTarget: "   ",
        slaHours: null,
        autoResponse: "",
      }),
    ).toBe(false);
  });
});

describe("slaUrgency", () => {
  it("classifies by duration", () => {
    expect(slaUrgency(null)).toBe("none");
    expect(slaUrgency(0.25)).toBe("urgent");
    expect(slaUrgency(0.5)).toBe("urgent");
    expect(slaUrgency(1)).toBe("high");
    expect(slaUrgency(2)).toBe("high");
    expect(slaUrgency(3)).toBe("normal");
    expect(slaUrgency(4)).toBe("normal");
    expect(slaUrgency(8)).toBe("low");
  });
});
