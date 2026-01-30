// Starlink4All Application Logic

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

let currentUserLocation = null;
let currencySymbol = '$';
let exchangeRate = 1;

async function initApp() {
    await detectRegionAndPricing();
    loadCalculator();
    setupEventListeners();
    
    // Initial load
    refreshHelpersList();
}

async function detectRegionAndPricing() {
    try {
        // 1. Try Timezone heuristic
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && tz.startsWith('Africa/')) {
            setCurrency('R', 900, 3800, 18);
            return; 
        }

        // 2. IP Fallback
        const res = await fetch('https://get.geojs.io/v1/ip/country.json');
        const data = await res.json();
        
        if (data.country === 'ZA') {
             setCurrency('R', 900, 3800, 18);
        }
        // Default remains USD
        
    } catch (e) {
        console.warn("Could not detect region for pricing, using default USD.");
    }
}

let standardMonthlyCost = 120; // Default

function setCurrency(symbol, monthly, equip, rate = 1) {
    currencySymbol = symbol;
    exchangeRate = rate;
    standardMonthlyCost = monthly;
    
    // Update Inputs
    document.getElementById('monthlyCost').value = monthly;
    document.getElementById('equipCost').value = equip;
    
    // Update Labels
    document.querySelectorAll('.currency-label').forEach(el => el.innerText = symbol);
}

function handleCardClick(event, text) {
    // Ignore clicks on buttons/links
    if (event.target.closest('button') || event.target.closest('a')) return;

    // 1. Parse price from text (e.g. $20, R300, 20)
    // We look for numbers. If currency symbol matches, great.
    // Simple regex for first number found
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (!match) return;
    
    let amount = parseFloat(match[1]);
    
    // If text had '$' but we are in 'R' mode, we need to convert the found amount?
    // `localizeCurrency` converts the DISPLAY text.
    // But the `text` passed here is the RAW text (from helper.package).
    // If raw text says "$10" and we are in ZA (Rate 18):
    // We want to add R180 to the base R900.
    
    // Check if raw text contains '$'
    if (text.includes('$') && exchangeRate !== 1) {
        amount = amount * exchangeRate;
    }

    // 2. Update Calculator
    // New Total = Standard Base + Helper Fee
    const newTotal = standardMonthlyCost + amount;
    
    const input = document.getElementById('monthlyCost');
    input.value = newTotal.toFixed(2);
    
    // 3. Trigger Recalc
    calculateCost();
    
    // 4. Feedback (Highlight Calculator)
    const calcSection = document.getElementById('calculator');
    calcSection.scrollIntoView({ behavior: 'smooth' });
    input.classList.add('bg-warning'); // Flash effect
    setTimeout(() => input.classList.remove('bg-warning'), 500);
}

function localizeCurrency(text) {
    if (!text) return "";
    if (exchangeRate === 1) return text;

    // Regex to match $ followed by number (e.g. $5, $10.50)
    // allowing optional space between $ and number
    return text.replace(/\$\s?(\d+(?:\.\d+)?)/g, (match, amount) => {
        const val = parseFloat(amount);
        const converted = Math.round(val * exchangeRate);
        return `${currencySymbol}${converted}`;
    });
}

function setupEventListeners() {
    // Calculator
    const calcInputs = ['monthlyCost', 'numUsers', 'equipCost', 'totalSpeed'];
    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calculateCost);
    });

    // Modal - Geo
    document.getElementById('geoLocateBtn').addEventListener('click', () => {
        const btn = document.getElementById('geoLocateBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Detecting...`;
        btn.disabled = true;

        getGeolocation((pos) => {
            const lat = pos.coords.latitude.toFixed(5);
            const lng = pos.coords.longitude.toFixed(5);
            document.getElementById('helperLatLong').value = `${lat}, ${lng}`;
            btn.innerHTML = `<i class="fas fa-check"></i> Found`;
            setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
        }, (err) => {
             console.warn("Geo Error:", err);
             btn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Failed`;
             
             let msg = "Could not get location.";
             if (err.code === 1) msg = "Permission Denied. Please allow location access.";
             else if (err.code === 2) msg = "Position Unavailable. GPS signal lost or network issue.";
             else if (err.code === 3) msg = "Timeout. Location took too long.";
             
             if (window.location.protocol === 'file:') {
                 msg += "\n\nNOTE: Geolocation often fails when opening files directly. Try using a local server (localhost).";
             }
             
             alert(msg);
             setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
        });
    });

    // Modal - Save
    document.getElementById('saveHelperBtn').addEventListener('click', handleSaveHelper);

    // Modal - Reset on Open
    const joinModal = document.getElementById('joinModal');
    joinModal.addEventListener('show.bs.modal', (event) => {
        // Only reset if we are NOT clicking an "Edit" button
        if (!event.relatedTarget || !event.relatedTarget.dataset.edit) {
             document.getElementById('helperForm').reset();
             document.getElementById('editId').value = "";
             document.getElementById('saveHelperBtn').innerText = "Post My Offer";
             document.querySelector('#joinModal .modal-title').innerText = "I Can Help / Share";
        }
    });

    // Locate Me (Main Page)
    document.getElementById('locateMeBtn').addEventListener('click', () => {
        const status = document.getElementById('locationStatus');
        status.innerText = "Locating...";
        getGeolocation((pos) => {
            currentUserLocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };
            status.innerText = "Location found! Sorting list...";
            refreshHelpersList();
        }, (err) => {
            let msg = "Location access failed.";
            if (err.code === 1) msg = "Permission Denied.";
            else if (err.code === 2) msg = "Position Unavailable.";
            else if (err.code === 3) msg = "Timeout.";
            
            status.innerText = msg;
            
            if (window.location.protocol === 'file:') {
                 alert("Geolocation restriction: Browser may block location on 'file://' URLs. Please serve this site via a local server (localhost) or https.");
            } else {
                 alert("Error: " + msg);
            }
        });
    });
}

// --- Calculator ---
function loadCalculator() {
    calculateCost();
}

function calculateCost() {
    const monthlyCost = parseFloat(document.getElementById('monthlyCost').value) || 0;
    const equipCost = parseFloat(document.getElementById('equipCost').value) || 0;
    const totalSpeed = parseFloat(document.getElementById('totalSpeed').value) || 0;
    const users = parseFloat(document.getElementById('numUsers').value) || 1;
    
    // Update slider display
    document.getElementById('numUsersDisplay').innerText = users;

    if (users <= 0) return;

    // Monthly per person
    const monthlyPerPerson = monthlyCost / users;
    document.getElementById('monthlyResult').innerText = `${currencySymbol}${monthlyPerPerson.toFixed(2)}`;

    // Equipment per person
    const equipPerPerson = equipCost / users;
    document.getElementById('equipResult').innerText = `${currencySymbol}${equipPerPerson.toFixed(2)}`;

    // Savings %
    let savings = 0;
    if (users > 1) {
        savings = ((monthlyCost - monthlyPerPerson) / monthlyCost) * 100;
    }
    document.getElementById('saveResult').innerText = `${Math.round(savings)}%`;

    // Speed Range (Min: Everyone active)
    const minSpeed = totalSpeed / users;
    // Formatting: 50 Mbps
    let speedText = `${Math.round(minSpeed)} Mbps`;
    
    const speedRes = document.getElementById('speedResult');
    if(speedRes) speedRes.innerText = speedText;
}

// --- Geolocation ---
function getGeolocation(successCb, errorCb) {
    // Options: Low accuracy is faster/better for IP-based desktop estimation
    const options = {
        enableHighAccuracy: false, 
        timeout: 7000, // Short timeout to trigger fallback quickly
        maximumAge: 60000
    };

    // Fallback: IP-based Geolocation (Free service, HTTPS compatible)
    const runFallback = () => {
        console.log("Browser geo unavailable/timeout. Attempting IP fallback...");
        fetch('https://get.geojs.io/v1/ip/geo.json')
            .then(res => res.json())
            .then(data => {
                if (!data.latitude || !data.longitude) throw new Error("Invalid IP data");
                
                // Construct a mimic Position object
                const pos = {
                    coords: {
                        latitude: parseFloat(data.latitude),
                        longitude: parseFloat(data.longitude),
                        accuracy: 5000 // Low accuracy (City level)
                    },
                    timestamp: Date.now()
                };
                successCb(pos);
            })
            .catch(err => {
                console.warn("IP Fallback failed:", err);
                // Call original error callback with a generic error
                if (errorCb) errorCb({ code: 2, message: "Location detection failed completely." });
            });
    };

    if (!navigator.geolocation) {
        runFallback();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        successCb, 
        (err) => {
            console.warn("Native Geo Error:", err.code, err.message);
            // Code 1: Permission Denied -> Do NOT use fallback (respect user choice)
            // Code 2: Position Unavailable -> Use fallback
            // Code 3: Timeout -> Use fallback
            if (err.code === 1) {
                if (errorCb) errorCb(err);
            } else {
                runFallback();
            }
        }, 
        options
    );
}

// --- Helpers List ---
async function refreshHelpersList() {
    renderHelpersLoading();
    try {
        const helpers = await appStorage.getHelpers();
        
        // Sort by distance if location known
        if (currentUserLocation) {
            helpers.forEach(h => {
                h.distance = calculateDistance(
                    currentUserLocation.lat, currentUserLocation.lng,
                    h.lat, h.lng
                );
            });
            helpers.sort((a, b) => a.distance - b.distance);
        }

        renderHelpers(helpers);
    } catch (e) {
        console.error(e);
    }
}

function renderHelpersLoading() {
    document.getElementById('helpersList').innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2">Connecting to community...</p>
        </div>`;
}

function renderHelpers(helpers) {
    const container = document.getElementById('helpersList');
    container.innerHTML = '';
    const mySecret = appStorage.getPublicKey();

    if (!helpers || helpers.length === 0) {
        container.innerHTML = `<div class="col-12 text-center text-muted">No helpers found yet. Be the first!</div>`;
        return;
    }

    helpers.forEach((helper, index) => {
        const distStr = helper.distance !== undefined 
            ? `<span class="distance-badge"><i class="fas fa-map-marker-alt"></i> ${helper.distance.toFixed(1)} km</span>` 
            : '';

        // Edit Button Logic (Supabase Version)
        const mySecret = appStorage.getPublicKey();
        const isMine = helper.owner_secret === mySecret;
        
        const editBtn = isMine 
            ? `<button class="btn btn-sm btn-outline-secondary ms-auto" onclick="openEditModal('${helper.id}')"><i class="fas fa-edit"></i> Edit</button>`
            : '';

        // Unique ID for this card's collapse
        const collapseId = `contact-${helper.id || index}`;

        // Qual Section
        const qualSection = helper.qualifications 
            ? `<hr><h6 class="card-subtitle mb-2 text-muted">Qualification</h6><p class="card-text">${escapeHtml(helper.qualifications)}</p>` 
            : '';

        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4';
        card.innerHTML = `
            <div class="card helper-card shadow-sm h-100" style="cursor: pointer;" onclick="handleCardClick(event, '${escapeHtml(helper.package || '')}')">
                <div class="card-header d-flex align-items-center position-relative">
                    <div class="avatar-placeholder"><i class="fas fa-user"></i></div>
                    <div class="text-truncate flex-grow-1">
                        <strong>${escapeHtml(helper.name)}</strong>
                        ${distStr}
                    </div>
                    ${editBtn}
                </div>
                <div class="card-body">
                    <h6 class="card-subtitle mb-2 text-muted">Contact</h6>
                    
                    <!-- Fold-out Contact Logic -->
                    <button class="btn btn-sm btn-primary w-100 mb-2" 
                            onclick="revealContact(this, '${helper.id}', '${collapseId}')">
                        <i class="fas fa-eye me-1"></i> Show Contact Info
                    </button>
                    
                    <div id="${collapseId}" class="d-none">
                        <div class="p-2 bg-light border rounded">
                            <p class="card-text small mb-0">${linkify(escapeHtml(helper.contact))}</p>
                        </div>
                    </div>

                    ${qualSection}

                    <hr>
                    <h6 class="card-subtitle mb-2 text-muted">Package / Offer</h6>
                    <p class="card-text">${escapeHtml(localizeCurrency(helper.package))}</p>
                </div>
                <div class="card-footer bg-white border-top-0 d-flex justify-content-between align-items-center">
                   <small class="text-muted">Posted: ${new Date(helper.created_at || helper.timestamp).toLocaleDateString()}</small>
                   <small class="text-muted" id="views-${helper.id}"><i class="fas fa-eye"></i> ${helper.clicks || 0} views</small>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Expose to window for inline onclicks
window.revealContact = (btn, helperId, collapseId) => {
    // 1. Hide the button
    btn.classList.add('d-none');
    
    // 2. Show the contact info
    const content = document.getElementById(collapseId);
    if (content) {
        content.classList.remove('d-none');
    }

    // 3. Increment View Count in UI immediately
    const viewEl = document.getElementById(`views-${helperId}`);
    if (viewEl) {
        // extract current count text (e.g. "12 views")
        let text = viewEl.innerText;
        let count = parseInt(text) || 0;
        count++;
        viewEl.innerHTML = `<i class="fas fa-eye"></i> ${count} views`;
    }

    // 4. Record the click in backend
    appStorage.incrementClick(helperId);
};

window.recordClick = (id) => {
    appStorage.incrementClick(id);
};

window.openEditModal = async (id) => {
    const helpers = await appStorage.getHelpers();
    const helper = helpers.find(h => h.id === id);
    if (!helper) return;

    document.getElementById('helperName').value = helper.name;
    document.getElementById('helperQual').value = helper.qualifications || '';
    document.getElementById('helperContact').value = helper.contact;
    document.getElementById('helperPackage').value = helper.package;
    document.getElementById('helperLatLong').value = `${helper.lat}, ${helper.lng}`;
    document.getElementById('editId').value = id;

    // Change Modal Title/Btn
    document.getElementById('saveHelperBtn').innerText = "Update Offer";
    document.querySelector('#joinModal .modal-title').innerText = "Edit My Offer";

    // Show Modal
    const modal = new bootstrap.Modal(document.getElementById('joinModal'));
    modal.show();
    // Tag the modal so the reset listener knows not to wipe it immediately
    document.getElementById('joinModal').dataset.edit = "true";
};


async function handleSaveHelper() {
    const name = document.getElementById('helperName').value;
    const qual = document.getElementById('helperQual').value;
    const contact = document.getElementById('helperContact').value;
    const pack = document.getElementById('helperPackage').value;
    const latLong = document.getElementById('helperLatLong').value;
    const editId = document.getElementById('editId').value;

    if (!name || !contact || !latLong) {
        alert("Please fill in all required fields (Name, Contact, Location)");
        return;
    }

    const [lat, lng] = latLong.split(',').map(s => parseFloat(s.trim()));
    if (isNaN(lat) || isNaN(lng)) {
        alert("Invalid location format. Please use 'Lat, Long' or the Auto-Detect button.");
        return;
    }

    const newHelper = {
        name,
        qualifications: qual,
        contact,
        package: pack,
        lat,
        lng
    };

    const btn = document.getElementById('saveHelperBtn');
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    btn.disabled = true;

    // Pass ID directly, empty string means new
    const success = await appStorage.saveHelper(newHelper, editId || null);

    if (success) {
        // Close modal
        const modalEl = document.getElementById('joinModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        
        // Cleanup modal state
        delete modalEl.dataset.edit;
        
        // Refresh list
        refreshHelpersList();
        alert(!editId ? "Offer Posted!" : "Offer Updated!");
    } else {
        alert("Error saving profile. Please check console/network.");
    }

    btn.innerText = originalText;
    btn.disabled = false;
}

// --- Utils ---

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/[&<>"]/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
        }[m];
    });
}

function linkify(text) {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
    return text
        .replace(urlRegex, '<a href="$1" target="_blank">$1</a>')
        .replace(emailRegex, '<a href="mailto:$1">$1</a>');
}
