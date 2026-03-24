
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkLogin() {
  console.log('Checking connection...');
  const { data: profiles, error } = await supabase.from('profiles').select('username, role').limit(5);
  
  if (error) {
    console.error('Error fetching profiles:', error.message);
  } else {
    console.log('Profiles found:', profiles);
  }
}

checkLogin();
