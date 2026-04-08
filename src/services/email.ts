import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

const from = process.env.SMTP_FROM ?? "Carton Cache <no-reply@cartoncache.com>";

export async function sendPasswordReset(to: string, resetUrl: string) {
  await transporter.sendMail({
    from,
    to,
    subject: "Reset your Carton Cache password",
    text: [
      "You requested a password reset for your Carton Cache account.",
      "",
      `Reset link (valid for 1 hour):`,
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <p>You requested a password reset for your Carton Cache account.</p>
      <p><a href="${resetUrl}" style="font-size:16px">Reset your password</a></p>
      <p style="color:#666;font-size:13px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
  });
}
