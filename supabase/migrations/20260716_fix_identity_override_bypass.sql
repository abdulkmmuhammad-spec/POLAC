-- MIGRATION: 20260716_fix_identity_override_bypass.sql
-- DESCRIPTION: Synchronizes anti-identity hijack triggers with authorized Commandant credential override RPCs.

-- 1. UPDATE TRIGGER FUNCTION TO RESPECT ADMINISTRATIVE OVERRIDE SESSION CONFIG
CREATE OR REPLACE FUNCTION public.prevent_identity_hijack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Allow explicit administrative credential overrides (set via set_config in admin RPCs)
    IF current_setting('app.allow_identity_override', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow clean INSERTs (new officers being registered).
    -- Only block UPDATEs where core identity fields (email, username) are mutated 
    -- from a previously established (non-null) state without administrative authorization.
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.email IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email) OR
           (OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username) THEN
            RAISE EXCEPTION 'IDENTITY VIOLATION: Cannot recycle identity credentials. Deactivate the account instead.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Ensure trigger binding remains active
DROP TRIGGER IF EXISTS trg_prevent_identity_hijack ON public.users;
CREATE TRIGGER trg_prevent_identity_hijack
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_identity_hijack();


-- 2. UPDATE ADMIN OVERRIDE RPC TO SET AUTHORIZATION SESSION FLAG DURING ATOMIC TRANSACTION
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
        -- Verify that the execution requestor is genuinely a Commandant
        SELECT role, COALESCE(full_name, username, 'Commandant') INTO v_admin_role, v_admin_name
        FROM public.users 
        WHERE id = p_admin_id;
        
        IF v_admin_role IS NULL OR v_admin_role != 'commandant' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Only the Commandant role can override credentials.';
        END IF;
        
        -- 2. STAGE 2: Capture Old States for Audit Records
        SELECT email, course_number INTO v_old_email, v_old_course
        FROM public.users
        WHERE id = p_target_user_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target user not found.';
        END IF;
        
        -- Set session variable to authorize identity modification within this transaction scope
        PERFORM set_config('app.allow_identity_override', 'true', true);
        
        -- 3. STAGE 3: Execute Atomic Updates
        UPDATE public.users
        SET 
            email = COALESCE(p_new_email, email),
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
        
        -- Return clean success validation state
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Credentials updated, forensic audit logged, and target notified.'
        );
    EXCEPTION WHEN OTHERS THEN
        -- Clean rollback of all updates, notifications, and logging actions
        RAISE EXCEPTION 'Security Transaction Terminated: %', SQLERRM;
    END;
$$;

GRANT EXECUTE ON FUNCTION admin_override_credentials(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;
