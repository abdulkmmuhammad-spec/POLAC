// Script to fix login passwords by applying the migration
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Error: VITE_SUPABASE_URL not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey || '');

async function fixPasswords() {
  try {
    console.log('🔧 Fixing login passwords...\n');

    // The pre-computed hash from the migration
    const expectedHash = '$2b$10$v0047uZkWcT4j9d51s3hpe.AUoeaCKnD6/RV8DtGdldF6F8pnaxCO';

    // Update commandant password
    console.log('Updating commandant password...');
    const { data: commandantData, error: commandantError } = await supabase
      .from('profiles')
      .update({ password_hash: expectedHash })
      .eq('username', 'commandant')
      .select();

    if (commandantError) {
      console.error('❌ Error updating commandant:', commandantError);
      console.log('\nNote: This script needs SUPABASE_SERVICE_ROLE_KEY to work.');
      console.log('Please set it in your .env file or run the SQL directly in Supabase dashboard.');
      return;
    }

    console.log('✅ Commandant password updated successfully');
    console.log(`   Username: commandant`);
    console.log(`   Password: password`);

    console.log('\n🎉 Login fix complete!');
    console.log('\nNow you can:');
    console.log('1. Start the dev server: npm run dev');
    console.log('2. Open http://localhost:5173');
    console.log('3. Login with: commandant / password');

  } catch (err) {
    console.error('❌ Error:', err);
  }
}

fixPasswords();