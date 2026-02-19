#!/usr/bin/env bun
/**
 * Email Parser Script
 *
 * NOTE: This script creates parsing tasks for Claude Code.
 * Actual parsing happens via Agent SDK / Claude Code interaction.
 *
 * For automated workflow: This prepares emails for the Agent SDK to parse.
 * For manual workflow: Ask Claude Code to parse the emails in data/emails-to-parse/
 *
 * Usage:
 *   bun run scripts/parse-emails.ts
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { EmailToParse } from '../src/utils/ai-parser';
import { generateEmailParsingPrompt } from '../src/utils/ai-parser';

const EMAILS_DIR = join(import.meta.dir, '../data/emails-to-parse');

console.log('📧 Email Parser - Agent Athens\n');

// Check if directory exists
if (!existsSync(EMAILS_DIR)) {
  console.log('✅ No emails to parse (directory does not exist)');
  process.exit(0);
}

// Get all email JSON files
const emailFiles = readdirSync(EMAILS_DIR).filter(f => f.endsWith('.json'));

if (emailFiles.length === 0) {
  console.log('✅ No emails to parse');
  process.exit(0);
}

console.log(`📊 Found ${emailFiles.length} emails to parse\n`);

// For each email, display parsing task
for (const file of emailFiles) {
  const filepath = join(EMAILS_DIR, file);
  const emailData: EmailToParse = JSON.parse(readFileSync(filepath, 'utf-8'));

  console.log(`📨 ${file}`);
  console.log(`   Subject: ${emailData.subject}`);
  console.log(`   From: ${emailData.from}`);
  console.log(`   Date: ${emailData.date}`);
  console.log('');
}

console.log('\n' + '='.repeat(60));
console.log('🤖 PARSING WORKFLOW');
console.log('='.repeat(60));
console.log('\nThese emails need to be parsed by Claude Code / Agent SDK.\n');
console.log('🔄 AUTOMATED OPTION (Agent SDK):');
console.log('   When Agent SDK integration is ready, it will:');
console.log('   1. Read each email from data/emails-to-parse/');
console.log('   2. Use tool_agent to extract events');
console.log('   3. Import events to database');
console.log('   4. Move processed emails to data/emails-parsed/\n');

console.log('👤 MANUAL OPTION (Claude Code):');
console.log('   Ask Claude Code:');
console.log('   "Parse the emails in data/emails-to-parse/ and add events to the database"\n');

console.log('📋 Example parsing prompt for first email:');
console.log('─'.repeat(60));
if (emailFiles.length > 0) {
  const firstEmail: EmailToParse = JSON.parse(
    readFileSync(join(EMAILS_DIR, emailFiles[0]), 'utf-8')
  );
  const prompt = generateEmailParsingPrompt(firstEmail);
  console.log(prompt.substring(0, 500) + '...\n');
}

console.log('💡 TIP: Claude Code provides FREE tool_agent access');
console.log('   No API costs when using Claude Code for parsing!\n');
