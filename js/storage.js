/**
 * Storage Adapter for Starlink4All
 * Backend: Supabase (Postgres as a Service)
 * 
 * Logic:
 * - Reads are public.
 * - Writes are public (insert).
 * - Updates require matching the 'owner_secret' stored in LocalStorage.
 */

// CONFIGURATION
const SUPABASE_URL = 'https://wjchtawfdiwnqovnzpuo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-UEJwCz9tP263MR1dybY1Q_x0IYYYl6'; // User provided key

class AppStorage {
    constructor() {
        this.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.identity = this.loadIdentity();
    }

    // --- Identity ---
    loadIdentity() {
        let secret = localStorage.getItem('starlink_secret_key');
        if (!secret) {
            secret = this.generateUUID();
            localStorage.setItem('starlink_secret_key', secret);
        }
        return { secret };
    }

    generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    getPublicKey() {
        // In this architecture, the "secret" acts as the ownership proof.
        // We use the secret itself to match against the DB record's 'owner_secret'.
        // For the UI "Edit" button, we will check if the DB record's secret matches our local secret.
        // NOTE: This means we pull the secret down to the client. 
        // In a Production App: You would NEVER do this. You would use Auth.uid().
        // But for this specific "No-Login" prototype, it's the compromise.
        return this.identity.secret;
    }

    // --- Data Operations ---

    async getHelpers() {
        // Fetch all helpers
        const { data, error } = await this.client
            .from('helpers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase Load Error:", error);
            // If offline or error, return empty array to avoid breaking UI
            // Or implement a fallback UI if critical
            return [];
        }

        // Filter expired (Client side for simplicity, or could be a View)
        const now = new Date();
        const expirationDays = 30;
        
        return data.filter(h => {
            const created = new Date(h.created_at);
            const ageDays = (now - created) / (1000 * 60 * 60 * 24);
            return ageDays < expirationDays;
        });
    }

    async saveHelper(helper, id = null) {
        // Prepare payload
        const payload = {
            name: helper.name,
            contact: helper.contact,
            qualifications: helper.qualifications || "",
            package: helper.package || "",
            lat: helper.lat,
            lng: helper.lng,
            // If updating, preserve existing clicks? Handled by ignoring it in update payload usually,
            // but here we just overwrite.
            // IMPORTANT: We save the OWNER SECRET so we can edit it later.
            owner_secret: this.identity.secret 
        };

        if (id) {
            // --- UPDATE ---
            // Security: We must ensure we only update if the secret matches.
            // Supabase RLS 'USING' policy can handle this, OR we just do it here implicitly
            // by relying on the client-side check + optimistic ID match.
            // Since we aren't using Auth, anyone *could* technically send an update request to the API 
            // if they knew the ID.
            // To make it secure without Auth, we would need a Postgres Function `update_helper(id, secret, data)`.
            // For this prototype, we will just proceed.
            const { error } = await this.client
                .from('helpers')
                .update(payload)
                .eq('id', id)
                .eq('owner_secret', this.identity.secret); // Extra safety check

            if (error) {
                console.error("Update Error:", error);
                return false;
            }
        } else {
            // --- INSERT ---
            const { error } = await this.client
                .from('helpers')
                .insert([payload]);

            if (error) {
                console.error("Insert Error:", error);
                return false;
            }
        }
        return true;
    }

    async incrementClick(helperId) {
        // We need an RPC (Stored Procedure) to increment atomically, 
        // OR we read-modify-write (race condition risk, but fine for click counters).
        // Let's try the RPC approach if possible, but simplest is read-write for now 
        // since we haven't set up RPCs.
        
        // 1. Get current clicks
        const { data, error } = await this.client
            .from('helpers')
            .select('clicks')
            .eq('id', helperId)
            .single();
            
        if (error || !data) return;

        // 2. Update
        await this.client
            .from('helpers')
            .update({ clicks: (data.clicks || 0) + 1 })
            .eq('id', helperId);
    }
}

const appStorage = new AppStorage();