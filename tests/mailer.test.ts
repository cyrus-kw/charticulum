import { describe, expect, it, vi } from "vitest";
import { consoleMailer, mailerFromEnv, resendMailer } from "../src/server/mailer";

const message = { to: "ana@example.com", subject: "123456 is your Charticulum code", text: "Code: 123456" };

describe("resendMailer", () => {
  it("posts the email to Resend with the API key", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    await resendMailer("re_key", "Charticulum <codes@example.com>", fetchFn).send(message);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toEqual({ from: "Charticulum <codes@example.com>", ...message });
  });

  it("throws with Resend's explanation when it refuses", async () => {
    const fetchFn = async () => new Response("domain is not verified", { status: 403 });
    await expect(resendMailer("re_key", "x@example.com", fetchFn).send(message)).rejects.toThrow(
      /403.*domain is not verified/,
    );
  });
});

describe("mailerFromEnv", () => {
  it("prints to the terminal in development", () => {
    expect(mailerFromEnv({ NODE_ENV: "development" })).toBe(consoleMailer);
  });

  it("fails to send (but doesn't throw right away) in production without a key", async () => {
    const mailer = mailerFromEnv({ NODE_ENV: "production" });
    await expect(mailer.send(message)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("needs EMAIL_FROM along with the key", async () => {
    const mailer = mailerFromEnv({ NODE_ENV: "production", RESEND_API_KEY: "re_key" });
    await expect(mailer.send(message)).rejects.toThrow(/EMAIL_FROM/);
  });
});
