#!/usr/bin/env tsx

/**
 * Add user to all servers as admin
 * 
 * Usage: npm run add-user-to-servers test_1767886927816@example.com
 * 
 * Note: Requires DATABASE_URL environment variable to be set
 */

import { db } from '../lib/db/client';
import { users, roles, userRoles } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { MVPRole } from '../lib/permissions/mvp-roles';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Error: Email is required');
    console.log('Usage: npm run add-user-to-servers email@example.com');
    process.exit(1);
  }

  try {
    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      console.error(`Error: User with email ${email} not found`);
      process.exit(1);
    }

    console.log(`Found user: ${user.id} (${user.email})`);

    // Get all servers
    const allServers = await db.query.servers.findMany();

    if (allServers.length === 0) {
      console.log('No servers found');
      process.exit(0);
    }

    console.log(`Found ${allServers.length} server(s)`);

    let addedCount = 0;
    let alreadyMemberCount = 0;
    let errorCount = 0;

    for (const server of allServers) {
      try {
        // Check if user already has a role in this server
        const existingRole = await db.query.userRoles.findFirst({
          where: and(
            eq(userRoles.userId, user.id),
            eq(userRoles.serverId, server.id)
          ),
        });

        if (existingRole) {
          console.log(`  ⚠ User already member of server "${server.name}" (${server.id})`);
          alreadyMemberCount++;
          continue;
        }

        // Find admin role for this server
        const adminRole = await db.query.roles.findFirst({
          where: and(
            eq(roles.serverId, server.id),
            eq(roles.name, MVPRole.ADMIN)
          ),
        });

        if (!adminRole) {
          console.error(`  ✗ Admin role not found for server "${server.name}" (${server.id})`);
          errorCount++;
          continue;
        }

        // Add user to server with admin role
        await db.insert(userRoles).values({
          userId: user.id,
          roleId: adminRole.id,
          serverId: server.id,
        });

        console.log(`  ✓ Added to server "${server.name}" (${server.id}) as admin`);
        addedCount++;
      } catch (error) {
        console.error(`  ✗ Error adding to server "${server.name}":`, error);
        errorCount++;
      }
    }

    console.log('\nSummary:');
    console.log(`  Added: ${addedCount}`);
    console.log(`  Already member: ${alreadyMemberCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Total servers: ${allServers.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
