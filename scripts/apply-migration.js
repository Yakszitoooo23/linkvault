/**
 * Script to apply the manual migration for removing company requirement
 * Run with: node scripts/apply-migration.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('📦 Reading migration SQL file...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../prisma/migrations/manual_migration.sql'),
      'utf8'
    );

    // Remove comments and split by semicolons
    const cleanedSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
      .join('\n');

    // Split by semicolons, but keep multi-line statements together
    const statements = cleanedSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.match(/^--/));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`\n🔄 Executing statement ${i + 1}/${statements.length}...`);
        console.log(`   ${statement.substring(0, 100)}...`);
        
        try {
          await prisma.$executeRawUnsafe(statement);
          console.log(`   ✅ Statement ${i + 1} executed successfully`);
        } catch (error) {
          // Check if it's a "already exists" error (which is fine with IF NOT EXISTS)
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log(`   ⚠️  Statement ${i + 1} skipped (already exists)`);
          } else {
            throw error;
          }
        }
      }
    }

    console.log('\n✅ Migration applied successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Regenerate Prisma client: npx prisma generate');
    console.log('   2. Test your application');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();

