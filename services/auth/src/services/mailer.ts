import { AGLogger } from '@ag/logger';
import nodemailer from 'nodemailer';

const logger = new AGLogger('auth:mailer', '1.0.0');

export interface IMailer {
  sendVerificationEmail(email: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
}

export class DevelopmentMailer implements IMailer {
  constructor() {
    if (process.env.NODE_ENV === 'production' && !process.env.SMTP_URL) {
      logger.warn({ action: 'mailer_init' } as any, "Using DevelopmentMailer in production because SMTP_URL is missing!");
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    logger.info({ action: 'send_verification_email', email } as any, `[MOCK EMAIL] Verification Link: http://localhost:3000/verify-email?token=${token}`);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    logger.info({ action: 'send_password_reset', email } as any, `[MOCK EMAIL] Password Reset Link: http://localhost:3000/reset-password?token=${token}`);
  }
}

export class ProductionMailer implements IMailer {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor(smtpUrl: string, fromEmail: string = 'noreply@example.com') {
    this.transporter = nodemailer.createTransport(smtpUrl);
    this.fromEmail = fromEmail;
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const link = `http://localhost:3000/verify-email?token=${token}`;
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: email,
      subject: 'Verify your email',
      text: `Click the link to verify your email: ${link}`,
      html: `<p>Click the link below to verify your email:</p><a href="${link}">${link}</a>`
    });
    logger.info({ action: 'send_verification_email', email } as any, 'Verification email sent');
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const link = `http://localhost:3000/reset-password?token=${token}`;
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: email,
      subject: 'Reset your password',
      text: `Click the link to reset your password: ${link}`,
      html: `<p>Click the link below to reset your password:</p><a href="${link}">${link}</a>`
    });
    logger.info({ action: 'send_password_reset', email } as any, 'Password reset email sent');
  }
}
