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
        // We use a few public relay peers to help bootstrap the connection
        const peers = [
            'https://gun-manhattan.herokuapp.com/gun',
            'https://gun-us.herokuapp.com/gun',
            'https://gun-eu.herokuapp.com/gun' 
        ];

        this.gun = Gun({
            peers: peers,
            localStorage: true
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
        
        // Monitor connection status (rudimentary check via peers)
        // Gun doesn't have a simple "onConnection" event, but we can assume 
        // if we are getting data, we are good.
        // For the UI, we'll just hide the offline warning after a short timeout 
        // if we have data, or if we detect network.
        setTimeout(() => this.checkSyncStatus(), 2000);
    }

    checkSyncStatus() {
        // If we have loaded data, or navigator is online, we assume we are "good enough"
        // for this decentralized demo.
        const connected = navigator.onLine; 
        this.notifyOfflineStatus(!connected);
    }

    // --- Identity ---
    loadIdentity() {
        let secret = localStorage.getItem('starlink_secret_key');
        if (!secret) {
            secret = crypto.randomUUID();
            localStorage.setItem('starlink_secret_key', secret);
        }
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

    async saveHelper(helper, index = -1) {
        try {
            const id = (index !== -1 && helper.id) ? helper.id : crypto.randomUUID();
            
            // Prepare object
            const entry = {
                id: id,
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
            this.db.get(id).put(entry);
            
            // Optimistic update for local UI
            this.helpers.set(id, entry);
            
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
