// Email transport (nodemailer over SMTP).
//
// Locally, mailpit runs in compose.yaml on 127.0.0.1:1025 (no auth) and the
// captured messages are inspectable at http://localhost:8025. In production
// these env vars point at Resend's SMTP relay (smtp.resend.com:465 with
// USER=resend, PASS=<api key>); see DEPLOY.md.

import { createTransport, type Transporter } from "nodemailer";

import { ServiceError } from "infra/errors";

export type MailMessage = {
  from?: string;
  to: string;
  subject: string;
  text: string;
};

let transporterCache: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporterCache) return transporterCache;

  const host = process.env.EMAIL_SMTP_HOST;
  const port = Number(process.env.EMAIL_SMTP_PORT);
  if (!host || !Number.isFinite(port)) {
    throw new ServiceError({
      cause: new Error("EMAIL_SMTP_HOST or EMAIL_SMTP_PORT not set"),
      message: "Servidor de email não configurado.",
      action: "Defina EMAIL_SMTP_HOST e EMAIL_SMTP_PORT no ambiente.",
    });
  }

  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;

  transporterCache = createTransport({
    host,
    port,
    // SMTPS on 465 with TLS upfront, STARTTLS on 587, plaintext on 1025 (mailpit).
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });

  return transporterCache;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const from = message.from ?? process.env.EMAIL_FROM;
  if (!from) {
    throw new ServiceError({
      cause: new Error("No `from` address — set EMAIL_FROM or pass message.from"),
      message: "Remetente de email não configurado.",
      action: "Defina EMAIL_FROM no ambiente ou informe `from` na mensagem.",
    });
  }

  try {
    await getTransporter().sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } catch (error) {
    throw new ServiceError({
      cause: error,
      message: "Erro ao enviar email.",
      action: "Verifique se o serviço de email está disponível.",
    });
  }
}
