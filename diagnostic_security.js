
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function getEnvVar(name) {
    const files = ['.env', '.env.local'];
    for (const file of files) {
        if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
                const index = line.indexOf('=');
                if (index !== -1 && line.substring(0, index).trim() === name) {
                    return line.substring(index + 1).trim().replace(/^["']|["']$/g, '');
                }
            }
        }
    }
    return null;
}

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('CRITICAL: Could not find Supabase credentials (URL/Key) in .env or .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runAudit() {
    console.log('\n=========================================');
    console.log('   NPA SYSTEM: PASSWORD SECURITY AUDIT   ');
    console.log('=========================================\n');

    const { data, error } = await supabase
        .from('profiles')
        .select('username, password_hash')
        .limit(20);

    if (error) {
        console.error('Audit Gate Failure:', error.message);
        return;
    }

    console.log(`Scan Complete: ${data.length} Credentials Analyzed.\n`);

    data.forEach(profile => {
        const hash = profile.password_hash || '';
        const isBcrypt = hash.startsWith('$2a$') || hash.startsWith('$2b$');
        const status = isBcrypt ? '✅ SECURE (BCRYPT)' : '❌ INSECURE (PLAINTEXT)';
        const normalizedUsername = String(profile?.username || 'UNKNOWN_USER');

        console.log(`User: ${normalizedUsername.padEnd(20)} | Status: ${status}`);
        if (!isBcrypt) {
            console.warn(`   [WARNING] Internal Security Alert: Insecure credential format detected for user.`);
        }
    });

    console.log('\n=========================================');
}

runAudit().catch(err => {
    console.error('Fatal Audit Error:', err);
});
