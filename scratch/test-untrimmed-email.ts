import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../services/auth/.env') });

async function main() {
  const transporter = nodemailer.createTransport(process.env.SMTP_URL!);
  
  // Test with spaces in to:
  try {
    console.log('Testing sendMail with untrimmed email...');
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: '  ' + process.env.FROM_EMAIL + '  ',
      subject: 'Test untrimmed email',
      text: 'hello'
    });
    console.log('Untrimmed email send succeeded!');
  } catch (err: any) {
    console.error('Untrimmed email send failed:', err.message);
  }
}

main().catch(console.error);
