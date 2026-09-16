-- Migration: Update admin_register_officer to return the new user's ID
-- Description: Ensures frontend can retrieve the UUID of the newly commissioned officer to assign them to a course.

CREATE OR REPLACE FUNCTION admin_register_officer(
    p_commandant_id TEXT,
    p_email TEXT,
    p_password TEXT,
    p_username TEXT,
    p_role TEXT
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count int;
    v_role text;
    v_new_id uuid;
BEGIN
    -- Verify the caller is actually a commandant
    SELECT role INTO v_role FROM public.users WHERE id::text = p_commandant_id;
    
    IF v_role != 'commandant' THEN
        RAISE EXCEPTION 'Unauthorized: Only Commandants can register new officers. Current role: %', v_role;
    END IF;

    -- Verify capacity limits (only counting active officers/commandants)
    SELECT count(*) INTO v_count FROM public.users WHERE role = p_role AND is_active = true;
    
    IF p_role = 'commandant' AND v_count >= 1 THEN
        RAISE EXCEPTION 'Capacity limit reached: System permits max 1 Commandant.';
    END IF;
    
    IF p_role = 'course_officer' AND v_count >= 5 THEN
        RAISE EXCEPTION 'Capacity limit reached: System permits max 5 Course Officers.';
    END IF;

    -- Check if email already exists
    SELECT count(*) INTO v_count FROM public.users WHERE email = lower(trim(p_email));
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Email already registered.';
    END IF;

    -- Insert new user and capture their auto-generated UUID
    INSERT INTO public.users(email, password, username, full_name, role, total_cadets)
    VALUES (lower(trim(p_email)), p_password, trim(p_username), trim(p_username), p_role, 0)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'status', 'success', 
        'message', 'Officer commissioned securely.', 
        'id', v_new_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_register_officer(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;
