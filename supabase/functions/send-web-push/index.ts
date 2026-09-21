import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, payload } = await req.json();

    if (!user_id || !payload) {
      throw new Error("Missing required parameters: 'user_id' and 'payload'");
    }

    // 1. Initialize Supabase Admin Client to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Fetch User Subscriptions
    const { data: subscriptions, error: dbError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id);

    if (dbError) {
      throw dbError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'User has no active push subscriptions', success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 3. Configure Web Push
    const publicVapidKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateVapidKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!publicVapidKey || !privateVapidKey) {
      throw new Error("Missing VAPID keys in environment variables");
    }

    webPush.setVapidDetails(
      'mailto:admin@polac.edu.ng', // Usually a contact email
      publicVapidKey,
      privateVapidKey
    );

    const stringifiedPayload = JSON.stringify(payload);
    
    let successCount = 0;
    let failureCount = 0;

    // 4. Send Notifications in Parallel
    const pushPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.auth_key,
          p256dh: sub.p256dh_key
        }
      };

      try {
        await webPush.sendNotification(pushSubscription, stringifiedPayload);
        successCount++;
      } catch (err: any) {
        // 5. Handle stale/revoked subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Subscription for endpoint ${sub.endpoint} has expired or is no longer valid. Deleting...`);
          await supabase
            .from('push_subscriptions')
            .delete()
            .match({ id: sub.id });
        } else {
          console.error(`Error sending push to ${sub.endpoint}:`, err);
        }
        failureCount++;
      }
    });

    await Promise.all(pushPromises);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Sent ${successCount} successfully, ${failureCount} failed.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
