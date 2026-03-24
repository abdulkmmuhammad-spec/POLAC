const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkCommandant() {
  console.log('Checking commandant profile...');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, password_hash')
    .eq('username', 'commandant')
    .single();

  if (error) {
    console.error('Error fetching commandant:', error.message);
    return;
  }

  console.log('User found:', data.username);
  console.log('Hash prefix:', data.password_hash.substring(0, 7));
  console.log('Hash length:', data.password_hash.length);
  
  if (data.password_hash.startsWith('$2b$10$')) {
    console.log('SUCCESS: Hash looks like a standard bcrypt hash (cost 10).');
  } else {
    console.warn('WARNING: Hash does not match expected bcrypt format ($2b$10$...).');
  }
}

checkCommandant();
