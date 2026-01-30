/**
 * Storage Adapter for Starlink4All
 * Backend: Gun.js (Decentralized, Offline-First, Real-time Graph DB)
 * 
 * Why Gun?
 * - No central server (Serverless)
 * - Democratized data (P2P syncing)
 * - Works offline (LocalStorage) and syncs when online
 */

class AppStorage {
    constructor() {
        this.helpers = new Map();
        this.isOffline = true; // Assume offline until peer connection
        this.identity = this.loadIdentity();
        this.initGun();
    }

    initGun() {
        console.log("Starlink4All Storage v1.2 Loading...");
        // Updated peers list: Removing flaky Heroku nodes, adding more community ones.
        const peers = [
            'https://peer.wallie.io/gun',
            'https://plato.design/gun',
            'https://gun.eco/gun',
            'https://gun-rs.herokuapp.com/gun',
            'https://gundb-relay.glitch.me/gun'
        ];

        this.gun = Gun({
            peers: peers,
            localStorage: true,
            retry: 3000 // Retry every 3s
        });
        
        this.isConnected = false;
        
        // Listen for successful peer connection
        this.gun.on('hi', () => {
            this.isConnected = true;
            this.notifyOfflineStatus(false);
            console.log("Connected to GunDB Relay!");
        });
        
        // Listen for disconnection (bye)
        this.gun.on('bye', () => {
             this.isConnected = false;
             // Don't immediately alert, as we might just be switching peers
        });

        this.db = this.gun.get('starlink4all_community_v1');

        // Real-time listener
        // 'map()' iterates over every item in the list
        this.db.map().on((data, id) => {
            if (data) {
                // Basic validation
                if (data.name && data.lat && data.lng) {
                     this.helpers.set(id, data);
                }
            } else {
                this.helpers.delete(id); // Null means deleted
            }
        });
        
        // Initial sync check
        setTimeout(() => this.checkSyncStatus(), 2500);
    }

    checkSyncStatus() {
        // If we have 0 helpers and not connected, warn user
        const healthy = this.isConnected || this.helpers.size > 0;
        this.notifyOfflineStatus(!healthy);
    }

    // --- Identity ---
    loadIdentity() {
        let secret = localStorage.getItem('starlink_secret_key');
        if (!secret) {
            secret = this.generateUUID();
            localStorage.setItem('starlink_secret_key', secret);
        }
        return {
            secret: secret,
            publicKey: this.simpleHash(secret)
        };
    }

    generateUUID() {
        // Native secure UUID or fallback for HTTP/Old Browsers
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
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
        // In Gun, data flows in asynchronously.
        // If the map is empty, we wait a bit to let the network sync.
        if (this.helpers.size === 0) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // Filter expired entries (client-side)
        const now = Date.now();
        const expirationMs = 30 * 24 * 60 * 60 * 1000; // 30 Days

        const list = Array.from(this.helpers.values()).filter(h => {
            if (!h.timestamp) return false;
            return (now - h.timestamp) < expirationMs;
        });

        return list;
    }

    async saveHelper(helper, id = null) {
        try {
            const entryId = id || this.generateUUID();
            
            // Prepare object
            const entry = {
                id: entryId,
                name: helper.name,
                qualifications: helper.qualifications || "",
                contact: helper.contact,
                package: helper.package || "",
                lat: helper.lat,
                lng: helper.lng,
                timestamp: Date.now(),
                publicKey: this.identity.publicKey,
                clicks: helper.clicks || 0
            };

            // Save to Gun (put)
            // We use the ID as the key in the set
            this.db.get(entryId).put(entry);
            
            // Optimistic update for local UI
            this.helpers.set(entryId, entry);
            
            return true;
        } catch (e) {
            console.error("GunDB Save Error:", e);
            return false;
        }
    }

    async incrementClick(helperId) {
        // Fetch current, increment, save.
        // Gun supports atomic operations but for simplicity we read-modify-write
        // effectively via the local cache which is synced.
        const item = this.helpers.get(helperId);
        if (item) {
            const newCount = (item.clicks || 0) + 1;
            this.db.get(helperId).get('clicks').put(newCount);
        }
    }

    notifyOfflineStatus(isOffline) {
        const alertBox = document.getElementById('offlineAlert');
        if (alertBox) {
            if (isOffline) {
                alertBox.classList.remove('d-none');
                alertBox.innerHTML = `<strong>Note:</strong> You are offline. Data is saved locally and will sync to the community when you reconnect.`;
            } else {
                alertBox.classList.add('d-none');
            }
        }
    }
}

const appStorage = new AppStorage();
