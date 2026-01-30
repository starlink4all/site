/**
 * Storage Adapter for Starlink4All
 * Supports: LocalStorage (Fallback), Pantry.cloud (Free JSON Storage)
 */

const STORAGE_CONFIG = {
    // Replace this with your own Pantry ID from pantry.cloud to go live!
    pantryId: '63383020-5c6a-48a6-89c0-639145695273', 
    basketName: 'starlink4all_helpers',
    expirationDays: 30
};

class AppStorage {
    constructor() {
        this.useCloud = true;
        this.helpers = [];
        this.identity = this.loadIdentity();
        this.isOffline = false;
    }

    // --- Identity & Keys (Light Public/Private Key) ---
    loadIdentity() {
        let secret = localStorage.getItem('starlink_secret_key');
        if (!secret) {
            secret = crypto.randomUUID();
            localStorage.setItem('starlink_secret_key', secret);
        }
        
        // Simple "Public Key" is a hash of the secret
        // In a real app, use WebCrypto API for actual keys.
        // Here, we just use a derived string to identify ownership.
        return {
            secret: secret,
            publicKey: this.simpleHash(secret)
        };
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    getPublicKey() {
        return this.identity.publicKey;
    }

    // --- Data Operations ---

    async getHelpers() {
        // Always try cloud first
        if (this.useCloud) {
            try {
                const data = await this.fetchFromPantry();
                this.isOffline = false;
                
                // Filter expired entries
                const now = Date.now();
                const validHelpers = (data.helpers || []).filter(h => {
                    const age = now - (h.timestamp || 0);
                    const maxAge = STORAGE_CONFIG.expirationDays * 24 * 60 * 60 * 1000;
                    return age < maxAge;
                });

                this.helpers = validHelpers;
                this.notifyOfflineStatus(false);
            } catch (e) {
                console.warn("Cloud storage unreachable, falling back to local demo data.", e);
                this.isOffline = true;
                this.notifyOfflineStatus(true);
                this.helpers = this.getLocalHelpers();
            }
        } else {
            this.helpers = this.getLocalHelpers();
        }
        return this.helpers;
    }

    async saveHelper(helper, index = -1) {
        // 1. Prepare the Helper Object
        if (index === -1) {
            // New Entry
            helper.timestamp = Date.now();
            helper.publicKey = this.identity.publicKey; // Ownership claim
            helper.clicks = 0;
            helper.id = crypto.randomUUID();
        } else {
            // Update Existing: Preserve non-editable fields
            const existing = this.helpers[index];
            helper.timestamp = Date.now(); // Renew expiration
            helper.publicKey = existing.publicKey;
            helper.clicks = existing.clicks;
            helper.id = existing.id;
        }

        // 2. Save Locally (Backup)
        let localHelpers = this.getLocalHelpers();
        if (index === -1) {
            localHelpers.push(helper);
        } else {
            // Find local match by ID if possible, else index might differ
            // For simplicity in this demo, we append or replace logic needs to be robust
            // We will just sync local with the latest state after cloud op
        }
        localStorage.setItem('starlink_helpers', JSON.stringify(localHelpers));

        // 3. Save to Cloud
        if (this.useCloud) {
            try {
                // Optimistic Locking strategy: Fetch latest, modify, save.
                const currentData = await this.fetchFromPantry();
                let currentList = currentData.helpers || [];

                if (index === -1) {
                    currentList.push(helper);
                } else {
                    // Find by ID to ensure we edit the right one in the cloud list
                    const cloudIndex = currentList.findIndex(h => h.id === helper.id);
                    if (cloudIndex !== -1) {
                        // verify ownership
                        if (currentList[cloudIndex].publicKey === this.identity.publicKey) {
                             currentList[cloudIndex] = helper;
                        } else {
                             throw new Error("Ownership mismatch");
                        }
                    }
                }
                
                await this.saveToPantry({ helpers: currentList });
                this.helpers = currentList; // Update local state
                return true;
            } catch (e) {
                console.error("Failed to save to cloud", e);
                this.notifyOfflineStatus(true);
                return false;
            }
        }
        return true;
    }

    async incrementClick(helperId) {
        if (!this.useCloud) return;

        try {
            const currentData = await this.fetchFromPantry();
            let currentList = currentData.helpers || [];
            
            const item = currentList.find(h => h.id === helperId);
            if (item) {
                item.clicks = (item.clicks || 0) + 1;
                await this.saveToPantry({ helpers: currentList });
                console.log(`Recorded click for ${helperId}`);
            }
        } catch (e) {
            console.warn("Could not record click (offline)", e);
        }
    }

    notifyOfflineStatus(isOffline) {
        const alertBox = document.getElementById('offlineAlert');
        if (alertBox) {
            if (isOffline) alertBox.classList.remove('d-none');
            else alertBox.classList.add('d-none');
        }
    }

    // --- Pantry.cloud Implementation ---
    async fetchFromPantry() {
        const url = `https://getpantry.cloud/apiv1/pantry/${STORAGE_CONFIG.pantryId}/basket/${STORAGE_CONFIG.basketName}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Pantry fetch failed');
        return await response.json();
    }

    async saveToPantry(data) {
        const url = `https://getpantry.cloud/apiv1/pantry/${STORAGE_CONFIG.pantryId}/basket/${STORAGE_CONFIG.basketName}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Pantry save failed');
        return await response.json();
    }

    // --- Local / Mock Data ---
    getLocalHelpers() {
        const stored = localStorage.getItem('starlink_helpers');
        if (stored) return JSON.parse(stored);
        return [];
    }
}

const appStorage = new AppStorage();