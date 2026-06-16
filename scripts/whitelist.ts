#!/usr/bin/env tsx

/**
 * Whitelist CLI script
 * 
 * Adds an email to the email whitelist table
 * 
 * Usage: npm run whitelist:add email@example.com
 */

import { db } from '../lib/db/client';
import { emailWhitelist } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateId } from '../lib/utils';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Error: Email is required');
    console.log('Usage: npm run whitelist:add email@example.com');
    process.exit(1);
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error(`Error: Invalid email format: ${email}`);
    process.exit(1);
  }

  try {
    // Check if email already exists
    const existing = await db.query.emailWhitelist.findFirst({
      where: eq(emailWhitelist.email, email),
    });

    if (existing) {
      console.log(`Email ${email} is already whitelisted`);
      process.exit(0);
    }

    // Insert email into whitelist
    await db.insert(emailWhitelist).values({
      id: generateId(),
      email: email.toLowerCase().trim(),
    });

    console.log(`✓ Successfully added ${email} to whitelist`);
    process.exit(0);
  } catch (error) {
    console.error('Error adding email to whitelist:', error);
    process.exit(1);
  }
}

main();
