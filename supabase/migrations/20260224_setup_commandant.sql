-- Migration: Secure Commandant Setup (Pre-Verified)
-- Description: Creates the root Commandant account without triggering email verification.

-- 1. CLEANUP (Remove old attempts)
DELETE FROM auth.users WHERE email = 'snr001@polac.com';

-- 2. Create the Commandant in Auth (Pre-Verified)
DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO auth.users (
      id, 
      instance_id, 
      email, 
      encrypted_password, 
      email_confirmed_at, 
      raw_app_meta_data, 
      raw_user_meta_data, 
      created_at, 
      updated_at, 
      role, 
      confirmation_token, 
      email_change, 
      email_change_sent_at, 
      last_sign_in_at
    )
    VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'snr001@polac.com', -- Case-insensitive check: use lowercase
      crypt('SecurePassword123', gen_salt('bf')), 
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"role": "commandant", "full_name": "Academy Commandant"}',
      now(),
      now(),
      'authenticated',
      '',
      '',
      NULL,
      now()
    );

    -- 2. Link to Identity (Required by Supabase)
    INSERT INTO auth.identities (
      id, 
      user_id, 
      identity_data, 
      provider, 
      provider_id, -- FOR EMAIL PROVIDER, THIS MUST BE THE EMAIL
      last_sign_in_at, 
      created_at, 
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      new_user_id,
      format('{"sub":"%s","email":"%s"}', new_user_id, 'snr001@polac.com')::jsonb,
      'email',
      'snr001@polac.com', -- The email is the provider ID
      now(),
      now(),
      now()
    );
END $$;

-- 3. SELF-CHECK (Run this to verify success)
-- SELECT * FROM auth.users WHERE email = 'snr001@polac.com';
-- SELECT * FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email = 'snr001@polac.com');
