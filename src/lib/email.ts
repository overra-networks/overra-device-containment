import { Resend } from "resend";

let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

function getFromAddress(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }
  return from;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  const client = getClient();
  const result = await client.emails.send({
    from: getFromAddress(),
    to,
    subject: "Reset your Overra password",
    text: [
      "We received a request to reset your Overra password.",
      "",
      "Open this link within 1 hour to set a new password:",
      resetUrl,
      "",
      "If you did not request this, you can safely ignore this email — your password will not change.",
    ].join("\n"),
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #131F32;">Reset your Overra password</h2>
        <p style="color: #364D6A;">
          We received a request to reset your Overra password.
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 20px; background: #4878FF;
                    color: #fff; text-decoration: none; border-radius: 8px;">
            Set a new password
          </a>
        </p>
        <p style="color: #6B84A8; font-size: 13px;">
          This link expires in 1 hour. If you did not request this, you can safely
          ignore this email — your password will not change.
        </p>
        <p style="color: #6B84A8; font-size: 12px; word-break: break-all;">
          ${resetUrl}
        </p>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(`Failed to send reset email: ${result.error.message}`);
  }
}
