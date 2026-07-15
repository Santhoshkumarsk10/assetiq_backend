const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587'),
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || ''
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function sendEmail({ to, subject, html }) {
  const fromName = process.env.MAIL_FROM_NAME || 'Aux AssetCare Team';
  const fromAddress = process.env.MAIL_FROM_ADDRESS || 'noreply@assetiq.com';
  
  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject,
    html
  };

  if (process.env.ENABLE_EMAILS === 'true') {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[SMTP] Email successfully sent to ${to}. MessageId: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`[SMTP ERROR] Failed to send email to ${to}:`, error.message);
      // Fall back to console logger
      logEmailToConsole(to, subject, html);
      return false;
    }
  } else {
    logEmailToConsole(to, subject, html);
    return true;
  }
}

function logEmailToConsole(to, subject, html) {
  console.log(`\n==================================================`);
  console.log(`[LOCAL DEV EMAIL LOG]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body:\n${html.replace(/<[^>]*>/g, ' ').trim().substring(0, 300)}...`);
  console.log(`==================================================\n`);
}

module.exports = { sendEmail };
