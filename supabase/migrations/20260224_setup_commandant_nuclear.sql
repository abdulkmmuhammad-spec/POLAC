-- "NUCLEAR SETUP" - RUN THIS IN SUPABASE SQL EDITOR
-- This script manually creates both the Auth Account and the Profile.
-- It works even if your triggers are missing!

-- 1. SETUP VARIABLES
DO $$
DECLARE
    target_email TEXT := 'snr001@polac.com';
    target_password TEXT := 'SecurePassword123';
    target_id UUID := gen_random_uuid();
BEGIN
    -- 2. CLEANUP EVERYTHING (Wipe out old attempts)
    DELETE FROM auth.users WHERE email = target_email;
    DELETE FROM public.profiles WHERE service_number = 'snr001' OR username = target_email;

    -- 3. CREATE AUTH USER
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        role,
        aud,
        created_at,
        updated_at
    )
    VALUES (
        target_id,
        '00000000-0000-0000-0000-000000000000',
        target_email,
        crypt(target_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        '{"role": "commandant", "full_name": "Academy Commandant", "service_number": "snr001"}',
        false,
        'authenticated',
        'authenticated',
        now(),
        now()
    );

    -- 4. CREATE IDENTITY
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        target_id,
        format('{"sub":"%s","email":"%s"}', target_id, target_email)::jsonb,
        'email',
        target_email,
        now(),
        now(),
        now()
    );

    -- 5. CREATE PROFILE MANUALLY (Just in case trigger is gone)
    INSERT INTO public.profiles (
        id,
        username,
        full_name,
        role,
        service_number
    )
    VALUES (
        target_id,
        target_email,
        'Academy Commandant',
        'commandant',
        'snr001'
    );

    RAISE NOTICE 'Setup Complete for % with ID %', target_email, target_id;
END $$;
