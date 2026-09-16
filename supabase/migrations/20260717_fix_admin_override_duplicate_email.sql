-- MIGRATION: 20260717_fix_admin_override_duplicate_email.sql
-- DESCRIPTION: Pre-validates email uniqueness in admin_override_credentials to return clean error messages on duplicate email inputs.

DROP FUNCTION IF EXISTS admin_override_credentials(UUID, UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS admin_override_credentials(UUID, UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_override_credentials(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_new_email TEXT,
    p_new_course_assignment TEXT,
    p_audit_action_details TEXT,
    p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_admin_role VARCHAR;
        v_admin_name VARCHAR;
        v_old_email VARCHAR;
        v_old_course INTEGER;
    BEGIN
        -- 1. STAGE 1: Strict Role Verification
        SELECT role, COALESCE(full_name, username, 'Commandant') INTO v_admin_role, v_admin_name
        FROM public.users 
        WHERE id = p_admin_id;
        
        IF v_admin_role IS NULL OR v_admin_role != 'commandant' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Only the Commandant role can override credentials.';
        END IF;
        
        -- 2. STAGE 2: Capture Old States & Pre-Validate User/Email Existence
        SELECT email, course_number INTO v_old_email, v_old_course
        FROM public.users
        WHERE id = p_target_user_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target user not found.';
        END IF;
        
        -- Pre-validate email uniqueness if a new email address is specified
        IF p_new_email IS NOT NULL AND TRIM(p_new_email) != '' AND LOWER(TRIM(p_new_email)) != LOWER(COALESCE(v_old_email, '')) THEN
            IF EXISTS (
                SELECT 1 FROM public.users 
                WHERE LOWER(email) = LOWER(TRIM(p_new_email)) 
                  AND id != p_target_user_id
            ) THEN
                RAISE EXCEPTION 'DUPLICATE_EMAIL: The email address "%" is already assigned to another user account.', TRIM(p_new_email);
            END IF;
        END IF;

        -- Set session variable to authorize identity modification within this transaction scope
        PERFORM set_config('app.allow_identity_override', 'true', true);
        
        -- 3. STAGE 3: Execute Atomic Updates
        UPDATE public.users
        SET 
            email = COALESCE(NULLIF(TRIM(p_new_email), ''), email),
            password = COALESCE(p_new_password, password),
            course_number = NULLIF(COALESCE(p_new_course_assignment, course_number::TEXT), 'nil')::INTEGER,
            course_name = CASE 
                WHEN p_new_course_assignment IS NOT NULL AND p_new_course_assignment != 'nil' THEN 'REGULAR COURSE ' || p_new_course_assignment 
                WHEN p_new_course_assignment = 'nil' THEN NULL 
                ELSE course_name 
            END
        WHERE id = p_target_user_id;
        
        -- 4. STAGE 4: Insert Single Consolidated Forensic Audit Log
        INSERT INTO public.audit_events (action_type, actor_id, actor_name, payload, created_at)
        VALUES (
            'CREDENTIAL_OVERRIDE',
            p_admin_id,
            v_admin_name,
            jsonb_build_object(
                'target_user_id', p_target_user_id,
                'changes', jsonb_build_object(
                    'old_email', v_old_email,
                    'new_email', p_new_email,
                    'old_course', v_old_course,
                    'new_course', p_new_course_assignment,
                    'password_updated', p_new_password IS NOT NULL
                ),
                'details', p_audit_action_details
            ),
            NOW()
        );
        
        -- 5. STAGE 5: Insert System Notification
        INSERT INTO public.notifications (id, type, title, content, timestamp, read, officer_name, course_number)
        VALUES (
            gen_random_uuid(),
            'profile_update',
            'Security Profile Updated',
            'An administrator has updated your official credential mappings.',
            NOW(),
            FALSE,
            v_admin_name,
            NULLIF(COALESCE(p_new_course_assignment, v_old_course::TEXT), 'nil')::INTEGER
        );
        
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Credentials updated, forensic audit logged, and target notified.'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Security Transaction Terminated: %', SQLERRM;
    END;
$$;

GRANT EXECUTE ON FUNCTION admin_override_credentials(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;
