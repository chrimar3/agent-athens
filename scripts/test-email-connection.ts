#!/usr/bin/env bun

/**
 * Email Connection Test Script
 *
 * Tests IMAP connection to verify email credentials are configured correctly.
 *
 * Usage: bun run scripts/test-email-connection.ts
 *
 * @see src/ingest/email-ingestion.ts
 */

import imaps from 'imap-simple';

// Load environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993');

async function testConnection(): Promise<void> {
  console.log('🔌 Email Connection Test\n');
  console.log('━'.repeat(50));

  // Check configuration
  console.log('\n📋 Configuration:');
  console.log(`   Host: ${IMAP_HOST}`);
  console.log(`   Port: ${IMAP_PORT}`);
  console.log(`   User: ${EMAIL_USER ? EMAIL_USER.substring(0, 3) + '***' : '❌ NOT SET'}`);
  console.log(`   Password: ${EMAIL_PASSWORD ? '***' + EMAIL_PASSWORD.slice(-4) : '❌ NOT SET'}`);

  // Validate required fields
  const errors: string[] = [];
  if (!EMAIL_USER) errors.push('EMAIL_USER is not set in .env');
  if (!EMAIL_PASSWORD) errors.push('EMAIL_PASSWORD is not set in .env');

  if (errors.length > 0) {
    console.log('\n❌ Configuration errors:');
    errors.forEach(e => console.log(`   • ${e}`));
    console.log('\n📝 To fix, add to your .env file:');
    console.log('   EMAIL_USER=your-email@gmail.com');
    console.log('   EMAIL_PASSWORD=your-app-password');
    console.log('\n💡 For Gmail, use an App Password:');
    console.log('   https://myaccount.google.com/apppasswords');
    process.exit(1);
  }

  // Attempt connection
  console.log('\n🔄 Connecting to IMAP server...');

  const config = {
    imap: {
      user: EMAIL_USER!,
      password: EMAIL_PASSWORD!,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      authTimeout: 10000,
    },
  };

  let connection;

  try {
    connection = await imaps.connect(config);
    console.log('✅ Connected successfully!\n');

    // Get mailbox info
    const box = await connection.openBox('INBOX');
    console.log('📬 Mailbox Info:');
    console.log(`   Total messages: ${box.messages.total}`);
    console.log(`   Unread messages: ${box.messages.unseen || 0}`);

    // Search for unread
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'], markSeen: false };
    const messages = await connection.search(searchCriteria, fetchOptions);

    console.log(`\n📧 Unread emails: ${messages.length}`);

    if (messages.length > 0 && messages.length <= 5) {
      console.log('\n   Recent unread:');
      for (const msg of messages.slice(0, 5)) {
        const header = msg.parts.find((p: any) => p.which.includes('HEADER'));
        if (header) {
          const lines = header.body;
          const subject = lines.subject?.[0] || 'No subject';
          const from = lines.from?.[0] || 'Unknown';
          console.log(`   • ${subject.substring(0, 50)}...`);
          console.log(`     From: ${from.substring(0, 40)}`);
        }
      }
    }

    console.log('\n' + '━'.repeat(50));
    console.log('✅ Email connection test PASSED');
    console.log('   Ready for email ingestion!');

  } catch (error) {
    const err = error as Error;
    console.log('\n❌ Connection failed!\n');
    console.log(`   Error: ${err.message}`);

    // Provide helpful diagnostics
    if (err.message.includes('Invalid credentials')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • Check EMAIL_USER is correct');
      console.log('   • For Gmail, use an App Password (not your regular password)');
      console.log('   • Generate at: https://myaccount.google.com/apppasswords');
    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • Check your internet connection');
      console.log('   • Verify IMAP_HOST and IMAP_PORT are correct');
      console.log('   • For Gmail: imap.gmail.com:993');
    } else if (err.message.includes('certificate')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • TLS certificate issue');
      console.log('   • Try updating your system certificates');
    }

    process.exit(1);

  } finally {
    if (connection) {
      connection.end();
      console.log('\n🔌 Disconnected');
    }
  }
}

// Run test
testConnection().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
