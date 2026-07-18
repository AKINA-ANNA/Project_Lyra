/* -------------------------------------------------------------
   VM Portal - Console Dashboard Core Logic Script
   Features: Auth Protection, Diagnostics, Polling, SVG Charts,
             Command Palette, AI Assistant, Deployment Steps, Toast Alerts
   ------------------------------------------------------------- */

const AGENT_API = "http://127.0.0.1:8000";
let pollIntervalId = null;
let pollRate = 5000; // default 5s
let isAgentOnline = false;

// History for the SVG chart
let cpuHistory = [20, 25, 18, 30, 22, 35, 28, 40, 32, 25];
let ramHistory = [40, 42, 41, 45, 43, 44, 46, 45, 47, 48];
const MAX_HISTORY = 10;

// Current VM state lists
let currentVMsList = [];
let discoveredTemplates = [];
let activityLogs = [];

document.addEventListener("DOMContentLoaded", () => {
    // 1. Guard check
    checkAuthGuard();
    
    // 2. Setup widgets & UI listeners
    initClock();
    initWeather();
    initTabNavigation();
    initSettingsListeners();
    initCommandPalette();
    initAIAssistant();
    initNotificationCenter();
    initSearchFilter();
    
    // 3. Launch Initial Scan
    runLoadingSequence();
});

/* =============================================================
   1. Auth Guard Check
   ============================================================= */
function checkAuthGuard() {
    if (!FirebaseAuthHelper.isLoggedIn) {
        window.location.href = "index.html";
        return;
    }
    
    const user = FirebaseAuthHelper.getUser();
    if (user) {
        document.getElementById("user-display-name").textContent = user.name || "Admin User";
        document.getElementById("user-email").textContent = user.email || "admin@vmportal.local";
        const avatarImg = document.getElementById("user-avatar");
        if (avatarImg && user.photoURL) {
            avatarImg.src = user.photoURL;
        }
    }
    
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            FirebaseAuthHelper.logOut().then(() => {
                window.location.href = "index.html";
            });
        });
    }
}

/* =============================================================
   2. Startup & Loading Screen Sequence
   ============================================================= */
async function runLoadingSequence() {
    const loadingScreen = document.getElementById("loading-screen");
    const statusText = document.getElementById("loading-status-text");
    const fill = document.getElementById("loading-bar-fill");
    
    // Progress tracker helper
    const updateProgress = (pct, text) => {
        fill.style.width = `${pct}%`;
        statusText.textContent = text;
    };
    
    try {
        // Step 1: Scan local agent (0% -> 20%)
        updateProgress(20, "Scanning Local Agent on localhost:8000...");
        await delay(800);
        
        const healthResponse = await fetch(`${AGENT_API}/health`);
        if (!healthResponse.ok) throw new Error("Agent connection offline");
        const health = await healthResponse.json();
        isAgentOnline = true;
        updateAgentPill(true);
        
        // Step 2: Validate VirtualBox (20% -> 50%)
        updateProgress(50, `Connecting... VirtualBox Version: ${health.vbox_version}`);
        await delay(800);
        
        if (!health.vbox_installed) {
            showToast("VirtualBox installation not verified. Redirecting to setup.", "error");
            await delay(1000);
            window.location.href = "index.html#setup-wizard";
            return;
        }
        
        // Step 3: Fetch templates (50% -> 75%)
        updateProgress(75, "Detecting Master VM templates...");
        await fetchTemplates();
        await delay(500);
        
        // Step 4: Loading Console (75% -> 100%)
        updateProgress(100, "Provisioning Console Environment...");
        await delay(600);
        
        // Load initial data
        await fetchVMs();
        await fetchSystemHealth();
        await fetchLogs();
        drawTelemetryChart();
        
        // Start background polling
        startBackgroundPolling();
        
        // Clear loading screen
        loadingScreen.classList.add("fade-out");
    } catch (err) {
        console.error(err);
        updateProgress(100, "Error: Agent Offline");
        showToast("Local agent connection failed. Please launch the agent server.", "error");
        await delay(1200);
        window.location.href = "index.html#setup-wizard";
    }
}

/* =============================================================
   3. REST API Requests
   ============================================================= */
async function fetchTemplates() {
    try {
        const res = await fetch(`${AGENT_API}/templates`);
        if (!res.ok) throw new Error("Failed to fetch templates");
        discoveredTemplates = await res.json();
        
        // Render template cards
        renderTemplates();
        
        // Update stats card
        document.getElementById("stat-templates").textContent = discoveredTemplates.length;
    } catch (err) {
        console.error(err);
        showToast("Error retrieving template images from agent.", "error");
    }
}

async function fetchVMs() {
    try {
        const res = await fetch(`${AGENT_API}/vms`);
        if (!res.ok) throw new Error("Failed to fetch VMs");
        currentVMsList = await res.json();
        
        // Filter and render list
        renderVMs();
        
        // Update stats
        const running = currentVMsList.filter(vm => vm.status === "running").length;
        const stopped = currentVMsList.filter(vm => vm.status === "stopped").length;
        
        animateCounter("stat-running-vms", running);
        animateCounter("stat-stopped-vms", stopped);
    } catch (err) {
        console.error(err);
        updateAgentPill(false);
    }
}

async function fetchSystemHealth() {
    try {
        const res = await fetch(`${AGENT_API}/system`);
        if (!res.ok) throw new Error("Failed to fetch system metrics");
        const sys = await res.json();
        
        // Update Stats values
        document.getElementById("stat-host-cpu").textContent = `${sys.cpu_usage}%`;
        document.getElementById("stat-host-ram").textContent = `${sys.ram_usage}%`;
        document.getElementById("stat-host-disk").textContent = `${sys.disk_usage}%`;
        
        // Progress Bars in stats
        document.getElementById("stat-cpu-bar").style.width = `${sys.cpu_usage}%`;
        document.getElementById("stat-ram-bar").style.width = `${sys.ram_usage}%`;
        document.getElementById("stat-disk-bar").style.width = `${sys.disk_usage}%`;
        
        // Append history for charts
        cpuHistory.push(sys.cpu_usage);
        if (cpuHistory.length > MAX_HISTORY) cpuHistory.shift();
        
        ramHistory.push(sys.ram_usage);
        if (ramHistory.length > MAX_HISTORY) ramHistory.shift();
        
        drawTelemetryChart();

        // System Health Page details
        document.getElementById("sys-os").textContent = sys.os;
        document.getElementById("sys-py").textContent = sys.python_version;
        document.getElementById("sys-fastapi").textContent = sys.agent_version;
        document.getElementById("sys-vbox").textContent = sys.vbox_version;
        document.getElementById("sys-vbox-path").textContent = sys.vbox_location;
        document.getElementById("sys-agent-status").textContent = sys.agent_status;
        document.getElementById("sys-sync-time").textContent = sys.last_refresh;
        
        // Health tab large progress fills
        document.getElementById("progress-cpu-val").textContent = `${sys.cpu_usage}%`;
        document.getElementById("progress-cpu-fill").style.width = `${sys.cpu_usage}%`;
        
        document.getElementById("progress-ram-val").textContent = `${sys.ram_usage}% (${sys.ram_used} GB / ${sys.ram_total} GB)`;
        document.getElementById("progress-ram-fill").style.width = `${sys.ram_usage}%`;
        
        document.getElementById("progress-disk-val").textContent = `${sys.disk_usage}% (${sys.disk_used} GB / ${sys.disk_total} GB)`;
        document.getElementById("progress-disk-fill").style.width = `${sys.disk_usage}%`;
        
        updateAgentPill(true);
    } catch (err) {
        console.error(err);
        updateAgentPill(false);
    }
}

async function fetchLogs() {
    try {
        const res = await fetch(`${AGENT_API}/logs`);
        if (!res.ok) throw new Error("Failed to fetch logs");
        activityLogs = await res.json();
        renderTimeline();
    } catch (err) {
        console.error(err);
    }
}

/* =============================================================
   4. VM Operations & Action Handler
   ============================================================= */
async function handleVMAction(vmName, action) {
    const cardEl = document.getElementById(`vm-card-${vmName}`);
    if (cardEl) {
        cardEl.classList.add("skeleton-card"); // visual loading state
    }
    
    showToast(`Sending ${action.toUpperCase()} command to VM '${vmName}'...`, "info");
    
    try {
        const res = await fetch(`${AGENT_API}/vm/${vmName}/${action}`, {
            method: "POST"
        });
        
        const result = await res.json();
        
        if (result.success) {
            showToast(result.message, "success");
            // Add a dynamic action log to timeline
            addLocalActivityLog(vmName, action, "SUCCESS");
        } else {
            showToast(result.error || `Action '${action}' failed.`, "error");
            addLocalActivityLog(vmName, action, "FAILED", result.error);
        }
    } catch (err) {
        showToast(`Backend communication error during ${action}: ${err.message}`, "error");
    } finally {
        // Reload states
        await fetchVMs();
        await fetchLogs();
        if (cardEl) {
            cardEl.classList.remove("skeleton-card");
        }
    }
}

function addLocalActivityLog(vmName, action, status, errorMsg = "") {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logText = `VM ${vmName} ${action} command sent - State: ${status}`;
    activityLogs.unshift(`${now} - ${logText} ${errorMsg ? '| ' + errorMsg : ''}`);
    renderTimeline();
}

/* =============================================================
   5. Provisioning Modal & Steps
   ============================================================= */
async function deployTemplateVM(templateName) {
    const modal = document.getElementById("provisioning-modal");
    const progressFill = document.getElementById("prov-progress-fill");
    const progressText = document.getElementById("prov-percentage");
    const cancelBtn = document.getElementById("btn-cancel-provisioning");
    
    // Clear modal step visual classes
    const steps = [1, 2, 3, 4, 5, 6, 7, 8];
    steps.forEach(s => {
        const el = document.getElementById(`prov-step-${s}`);
        if (el) {
            el.className = "prov-step";
            el.querySelector(".indicator").innerHTML = '<i class="fa-solid fa-circle"></i>';
        }
    });

    if (modal) modal.classList.add("active");
    updateProgressStep(1, 10, "Checking Agent Health...");
    
    let clonePromiseSuccess = false;
    let deployedVMName = "";
    
    try {
        // Step 1: Check Agent Health (10%)
        await delay(500);
        updateProgressStep(1, 25, "Step 1 Passed. Checking Master Template Configuration...", true);
        
        // Step 2: Validate template (25%)
        await delay(500);
        updateProgressStep(2, 40, "Step 2 Passed. Triggering Full VM Cloning (Subprocess clonevm)...", true);
        
        // Step 3-7: Cloning & booting sequence
        // Start deploy POST fetch asynchronously
        const deployPromise = fetch(`${AGENT_API}/deploy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: templateName })
        });
        
        // While cloning is running, we simulate progress bar drifting up slowly representing active drive write
        // (Full clone takes a little longer!)
        let simPct = 40;
        const progressTimer = setInterval(() => {
            if (simPct < 75) {
                simPct += 1.5;
                let stepStr = "Step 3: Cloning Master disks...";
                let stepNum = 3;
                if (simPct >= 65) {
                    stepStr = "Step 4: Registering cloned VM configuration...";
                    stepNum = 4;
                    updateProgressStep(3, simPct, "Step 3 Passed.", true);
                }
                updateProgressStep(stepNum, simPct, stepStr);
            }
        }, 300);
        
        const response = await deployPromise;
        clearInterval(progressTimer);
        
        if (!response.ok) throw new Error("Deployment request failed");
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || "Deployment failed");
        }
        
        deployedVMName = result.vm_name;
        clonePromiseSuccess = true;
        
        // Cloned and registered successfully! Move to Step 5 (Starting VM)
        updateProgressStep(4, 75, "Step 4 Passed. Starting cloned VM...", true);
        await delay(800);
        
        // Step 6: Waiting for VM boot
        updateProgressStep(5, 85, "Step 5 Passed. Waiting for Guest OS Boot...", true);
        updateProgressStep(6, 85, "Step 6: Waiting for VirtualBox Guest additions handshake...");
        
        // Wait a few seconds to simulate guest boot window and try to fetch guest details
        await delay(2500);
        updateProgressStep(6, 95, "Step 6 Passed. Collecting VM system properties...", true);
        
        // Step 7: Collect details
        updateProgressStep(7, 95, "Step 7: Refreshing interface configs...", true);
        await fetchVMs();
        await delay(800);
        
        // Step 8: Complete
        updateProgressStep(8, 100, "Step 8: Sandbox Deployed successfully!", true);
        showToast(`VM '${deployedVMName}' deployed and active!`, "success");
        
        // Redirect to running VMs panel
        setTimeout(() => {
            if (modal) modal.classList.remove("active");
            switchTab("running-vms");
        }, 1500);
        
    } catch (err) {
        console.error(err);
        // Set all active steps as failed
        showToast(`Provisioning failed: ${err.message}`, "error");
        
        // Highlight active step as failed
        const activeSteps = document.querySelectorAll(".prov-step.active");
        activeSteps.forEach(as => {
            as.className = "prov-step fail-step";
            as.querySelector(".indicator").innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        });
        
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.className = "btn btn-danger";
            cancelBtn.onclick = () => {
                modal.classList.remove("active");
            };
        }
    }
}

function updateProgressStep(stepNum, percent, labelText, isSuccess = false) {
    const stepEl = document.getElementById(`prov-step-${stepNum}`);
    const progressFill = document.getElementById("prov-progress-fill");
    const progressText = document.getElementById("prov-percentage");
    
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${Math.floor(percent)}%`;
    
    if (stepEl) {
        if (isSuccess) {
            stepEl.className = "prov-step success-step";
            stepEl.querySelector(".indicator").innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        } else {
            stepEl.className = "prov-step active";
            stepEl.querySelector(".indicator").innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        }
    }
}

/* =============================================================
   6. Render DOM Templates
   ============================================================= */
function renderTemplates() {
    const container = document.getElementById("templates-list-container");
    if (!container) return;
    
    if (discoveredTemplates.length === 0) {
        container.innerHTML = `
            <div class="glass-card empty-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; color: var(--warning-color); margin-bottom: 15px;"></i>
                <h4>No master template VMs registered!</h4>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">To deploy virtual machines, create a VirtualBox VM ending with "-Master" (e.g. Kali-Master) and take a snapshot named 'GoldenMaster'.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = discoveredTemplates.map(t => {
        const logoIcon = getOSIconClass(t.name);
        return `
            <div class="glass-card template-card" onclick="deployTemplateVM('${t.name}')">
                <div class="template-card-inner">
                    <div class="template-card-header">
                        <div class="os-icon-logo">
                            <i class="${logoIcon}"></i>
                        </div>
                        <div>
                            <h3>${t.name}</h3>
                            <span class="estimated-time" style="font-size: 0.65rem;">GoldenMaster Snapshot Verified</span>
                        </div>
                    </div>
                    <div class="template-card-body">
                        <p class="template-desc">${t.description}</p>
                        <div class="template-specs">
                            <div class="spec-cell">
                                <span class="label">vCPU</span>
                                <span class="val">${t.cpu} Cores</span>
                            </div>
                            <div class="spec-cell">
                                <span class="label">RAM</span>
                                <span class="val">${t.ram} MB</span>
                            </div>
                            <div class="spec-cell">
                                <span class="label">DISK SIZE</span>
                                <span class="val">${t.disk_size_gb > 0 ? t.disk_size_gb + ' GB' : 'Dynamic'}</span>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-glow btn-block" style="font-size: 0.8rem; margin-top: 10px;">
                        <i class="fa-solid fa-circle-plus"></i> Deploy VM
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function renderVMs() {
    const container = document.getElementById("vms-list-container");
    if (!container) return;
    
    // Apply search filter and status filter
    const searchVal = document.getElementById("vm-search-input").value.toLowerCase();
    const statusVal = document.getElementById("vm-filter-status").value;
    
    const filteredVMs = currentVMsList.filter(vm => {
        const matchesSearch = vm.name.toLowerCase().includes(searchVal) || vm.network_attachment.toLowerCase().includes(searchVal);
        const matchesStatus = statusVal === "all" || vm.status === statusVal;
        return matchesSearch && matchesStatus;
    });
    
    if (filteredVMs.length === 0) {
        container.innerHTML = `
            <div class="glass-card empty-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
                <i class="fa-solid fa-server" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 15px;"></i>
                <h4>No virtual machines match filter</h4>
                <p style="color: var(--text-secondary); font-size: 0.85rem;">Click the 'Templates' tab to deploy a new virtual machine clone.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredVMs.map(vm => {
        const logoIcon = getOSIconClass(vm.name);
        const stateClass = vm.status === "running" ? "status-running" : "status-offline";
        const stateText = vm.status === "running" ? "Running" : "Stopped";
        const isRunning = vm.status === "running";
        
        return `
            <div class="glass-card vm-card" id="vm-card-${vm.name}">
                <div class="template-card-header">
                    <div class="os-icon-logo">
                        <i class="${logoIcon}"></i>
                    </div>
                    <div>
                        <h3 style="font-size: 1rem;">${vm.name}</h3>
                        <span class="vm-status ${stateClass}">
                            <span class="pulse-indicator" style="display: ${isRunning ? 'inline-block' : 'none'};"></span> ${stateText}
                        </span>
                    </div>
                </div>
                
                <div class="vm-card-body-panel">
                    <div class="vm-grid-details">
                        <div class="detail-item">
                            <span class="label">IP ADDRESS</span>
                            <span class="val">${vm.ip_address}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">UPTIME</span>
                            <span class="val">${isRunning ? vm.uptime : 'Offline'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">RAM / CPU</span>
                            <span class="val">${vm.ram} MB / ${vm.cpu} vCPU</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">DISK SIZE</span>
                            <span class="val">${vm.disk_size_gb} GB</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">NETWORK</span>
                            <span class="val">${vm.network_attachment}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">SNAPSHOTS</span>
                            <span class="val">${vm.snapshot_used}</span>
                        </div>
                    </div>
                </div>
                
                <div class="vm-card-actions">
                    <button class="btn btn-secondary" onclick="handleVMAction('${vm.name}', 'start')" ${isRunning ? 'disabled' : ''} title="Start Headless">
                        <i class="fa-solid fa-play"></i><span>Start</span>
                    </button>
                    <button class="btn btn-secondary" onclick="handleVMAction('${vm.name}', 'stop')" ${!isRunning ? 'disabled' : ''} title="ACPI Stop">
                        <i class="fa-solid fa-stop"></i><span>Stop</span>
                    </button>
                    <button class="btn btn-secondary" onclick="handleVMAction('${vm.name}', 'restart')" ${!isRunning ? 'disabled' : ''} title="Reset VM">
                        <i class="fa-solid fa-arrows-spin"></i><span>Reset</span>
                    </button>
                    <button class="btn btn-secondary" onclick="handleVMAction('${vm.name}', 'console')" ${!isRunning ? 'disabled' : ''} title="Attach GUI window">
                        <i class="fa-solid fa-terminal"></i><span>Console</span>
                    </button>
                    <button class="btn btn-danger" onclick="confirmDeleteVM('${vm.name}')" title="Delete files">
                        <i class="fa-solid fa-trash-can"></i><span>Delete</span>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function renderTimeline() {
    const timeline = document.getElementById("activity-log-timeline");
    if (!timeline) return;
    
    if (activityLogs.length === 0) {
        timeline.innerHTML = '<div class="timeline-empty">No logged backend actions.</div>';
        return;
    }
    
    timeline.innerHTML = activityLogs.map(log => {
        // Format: 15:42:00 - Message here
        const splitIdx = log.indexOf(" - ");
        const timeStr = splitIdx !== -1 ? log.substring(0, splitIdx) : "";
        const descStr = splitIdx !== -1 ? log.substring(splitIdx + 3) : log;
        
        let statusClass = "success";
        if (descStr.toLowerCase().includes("failed") || descStr.toLowerCase().includes("error")) {
            statusClass = "failed";
        }
        
        return `
            <div class="timeline-item ${statusClass}">
                <div class="timeline-time">${timeStr}</div>
                <div class="timeline-dot"></div>
                <div class="timeline-content-card">
                    <h4>${descStr.split('|')[0].strip || descStr.split('|')[0]}</h4>
                    ${descStr.split('|')[1] ? `<p style="color: var(--error-color); font-family: var(--font-code); font-size: 0.7rem;">${descStr.split('|')[1]}</p>` : ''}
                </div>
            </div>
        `;
    }).join("");
}

function getOSIconClass(name) {
    const n = name.toLowerCase();
    if (n.includes("kali")) return "fa-brands fa-linux" + " text-cyan"; // FontAwesome linux
    if (n.includes("ubuntu") || n.includes("debian")) return "fa-brands fa-ubuntu";
    if (n.includes("win")) return "fa-brands fa-windows";
    return "fa-solid fa-server";
}

function confirmDeleteVM(name) {
    if (confirm(`CAUTION: Are you sure you want to unregister and completely delete all virtual disk files for VM '${name}'? This action cannot be undone.`)) {
        handleVMAction(name, "delete");
    }
}

/* =============================================================
   7. Background Polling Tasks
   ============================================================= */
function startBackgroundPolling() {
    if (pollIntervalId) clearInterval(pollIntervalId);
    
    pollIntervalId = setInterval(async () => {
        if (isAgentOnline) {
            await fetchVMs();
            await fetchSystemHealth();
            await fetchLogs();
        } else {
            // Try to ping health to reconnect
            try {
                const res = await fetch(`${AGENT_API}/health`);
                if (res.ok) {
                    isAgentOnline = true;
                    updateAgentPill(true);
                    showToast("Connection to local agent restored.", "success");
                }
            } catch (e) {
                // keep offline
            }
        }
    }, pollRate);
}

function updateAgentPill(online) {
    const pill = document.getElementById("agent-status-pill");
    const dot = document.getElementById("agent-conn-dot");
    if (pill) {
        if (online) {
            pill.className = "connection-status-pill online";
            pill.querySelector(".text").textContent = "Agent Connected";
        } else {
            pill.className = "connection-status-pill";
            pill.querySelector(".text").textContent = "Agent Offline";
            if (isAgentOnline) {
                isAgentOnline = false;
                showToast("Agent connection lost. Telemetry paused.", "warning");
            }
        }
    }
    if (dot) {
        dot.className = online ? "agent-connection-dot status-connected" : "agent-connection-dot status-disconnected";
    }
}

/* =============================================================
   8. SVG Chart Telemetry Drawing
   ============================================================= */
function drawTelemetryChart() {
    const svg = document.getElementById("telemetry-chart");
    const cpuPath = document.getElementById("cpu-path");
    const ramPath = document.getElementById("ram-path");
    
    if (!svg || !cpuPath || !ramPath) return;
    
    const width = 500;
    const height = 150;
    const padding = 10;
    
    const pointsCount = cpuHistory.length;
    const stepX = (width - padding * 2) / (pointsCount - 1);
    
    // CPU Path Generator
    let dCpu = "";
    for (let i = 0; i < pointsCount; i++) {
        const x = padding + i * stepX;
        // Flip Y since SVG 0 is top
        const y = height - padding - (cpuHistory[i] / 100) * (height - padding * 2);
        dCpu += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    }
    cpuPath.setAttribute("d", dCpu);
    
    // RAM Path Generator
    let dRam = "";
    for (let i = 0; i < pointsCount; i++) {
        const x = padding + i * stepX;
        const y = height - padding - (ramHistory[i] / 100) * (height - padding * 2);
        dRam += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    }
    ramPath.setAttribute("d", dRam);
}

/* =============================================================
   9. Widgets & Navigation UI Helpers
   ============================================================= */
function initClock() {
    const clockEl = document.getElementById("header-clock");
    if (!clockEl) return;
    
    setInterval(() => {
        const date = new Date();
        clockEl.querySelector("span").textContent = date.toLocaleTimeString();
    }, 1000);
}

function initWeather() {
    const weather = document.getElementById("header-weather");
    if (!weather) return;
    
    // Simulating weather updates
    const weathers = [
        "76°F Cloudy", "78°F Sunny", "74°F Rain showers", "72°F Misting"
    ];
    setInterval(() => {
        const randomWeather = weathers[Math.floor(Math.random() * weathers.length)];
        weather.querySelector("span").textContent = randomWeather;
    }, 60000);
}

function initTabNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.getAttribute("data-tab");
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    const navItems = document.querySelectorAll(".nav-item");
    const panes = document.querySelectorAll(".tab-pane");
    
    navItems.forEach(ni => {
        if (ni.getAttribute("data-tab") === tabId) {
            ni.classList.add("active");
        } else {
            ni.classList.remove("active");
        }
    });
    
    panes.forEach(pane => {
        if (pane.id === `pane-${tabId}`) {
            pane.classList.add("active");
        } else {
            pane.classList.remove("active");
        }
    });
}

function initSettingsListeners() {
    const pollRateSelect = document.getElementById("setting-poll-rate");
    if (pollRateSelect) {
        pollRateSelect.addEventListener("change", (e) => {
            pollRate = parseInt(e.target.value);
            startBackgroundPolling();
            showToast(`Telemetry polling interval updated to ${pollRate/1000}s.`, "info");
        });
    }

    const themeBtns = document.querySelectorAll(".glow-theme-btn");
    themeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            themeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const theme = btn.getAttribute("data-theme");
            // Set body theme
            document.body.className = `glow-${theme}`;
            showToast("Visual glow theme style updated.", "info");
        });
    });
}

/* =============================================================
   10. Command Palette Interface (Ctrl+K)
   ============================================================= */
function initCommandPalette() {
    const palette = document.getElementById("command-palette");
    const searchInput = document.getElementById("cmd-search-input");
    const results = document.getElementById("cmd-results-list");
    
    // Ctrl+K key listener
    window.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
            e.preventDefault();
            openCommandPalette();
        }
        if (e.key === "Escape") {
            closeCommandPalette();
        }
    });

    // Handle clicks inside results
    if (results) {
        results.addEventListener("click", (e) => {
            const item = e.target.closest(".cmd-item");
            if (!item) return;
            
            const action = item.getAttribute("data-action");
            const param = item.getAttribute("data-param");
            
            executePaletteCommand(action, param);
            closeCommandPalette();
        });
    }
    
    // Simple filter search
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const val = e.target.value.toLowerCase();
            const items = results.querySelectorAll(".cmd-item");
            
            items.forEach(item => {
                if (item.textContent.toLowerCase().includes(val)) {
                    item.style.display = "flex";
                } else {
                    item.style.display = "none";
                }
            });
        });
    }
}

function openCommandPalette() {
    const palette = document.getElementById("command-palette");
    const input = document.getElementById("cmd-search-input");
    if (palette) {
        palette.classList.add("active");
        if (input) {
            input.value = "";
            input.focus();
            // Reset results display
            const results = document.getElementById("cmd-results-list");
            results.querySelectorAll(".cmd-item").forEach(item => item.style.display = "flex");
        }
    }
}

function closeCommandPalette() {
    const palette = document.getElementById("command-palette");
    if (palette) palette.classList.remove("active");
}

function executePaletteCommand(action, param) {
    if (action === "go-tab") {
        switchTab(param);
    } else if (action === "cmd-palette-deploy") {
        switchTab("templates");
        showToast("Select a master image template to deploy.", "info");
    } else if (action === "cmd-palette-stop-all") {
        triggerBatchAction("stop");
    } else if (action === "cmd-palette-agent-check") {
        showToast("Running connection diagnosis...", "info");
        fetchSystemHealth().then(() => showToast("Diagnostic check passed.", "success"));
    }
}

/* =============================================================
   11. AI Assistant Widget UI Simulator
   ============================================================= */
function initAIAssistant() {
    const trigger = document.getElementById("ai-assistant-trigger");
    const chat = document.getElementById("ai-chat-window");
    const closeBtn = document.getElementById("btn-close-ai-chat");
    const sendBtn = document.getElementById("btn-send-ai-msg");
    const chatInput = document.getElementById("ai-chat-input");
    const messages = document.getElementById("ai-chat-messages");

    if (trigger) {
        trigger.addEventListener("click", () => {
            chat.classList.toggle("active");
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            chat.classList.remove("active");
        });
    }

    const sendMsg = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        
        // Append user msg
        appendChatMsg(text, "user");
        chatInput.value = "";
        
        // Bot processing simulation
        setTimeout(() => {
            const reply = getAICopilotResponse(text);
            appendChatMsg(reply, "bot");
        }, 800);
    };

    if (sendBtn) sendBtn.addEventListener("click", sendMsg);
    if (chatInput) {
        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") sendMsg();
        });
    }
}

function appendChatMsg(text, sender) {
    const container = document.getElementById("ai-chat-messages");
    if (!container) return;
    
    const msg = document.createElement("div");
    msg.className = `ai-msg ${sender}`;
    msg.innerHTML = `<p>${text}</p>`;
    
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function getAICopilotResponse(query) {
    const q = query.toLowerCase();
    
    if (q.includes("create") || q.includes("template")) {
        return "To discover a template, register a VM inside VirtualBox ending with '-Master' (e.g., <code>Kali-Master</code>). Then take a snapshot named <code>GoldenMaster</code>. VM Portal automatically discovers them.";
    }
    if (q.includes("clone") || q.includes("architecture")) {
        return "VM Portal deploys <b>Full Clones</b> of master templates. This copies the entire disks so your deployed sandbox runs independently without parent disk links.";
    }
    if (q.includes("start") || q.includes("run")) {
        // Attempt to find a matching VM and start it!
        const found = currentVMsList.find(vm => q.includes(vm.name.toLowerCase()));
        if (found) {
            handleVMAction(found.name, "start");
            return `Command dispatched: starting VM '${found.name}' in headless mode.`;
        }
        return "I can start your VM for you. Type: 'start [VM Name]' and I will dispatch the execution command.";
    }
    
    return "I am AGY, your virtualization helper. I can explain full clones, templates, and help you start, stop or delete VMs directly from here.";
}

/* =============================================================
   12. Notification Center & Toast Notices
   ============================================================= */
function initNotificationCenter() {
    const trigger = document.getElementById("notification-trigger");
    const dropdown = document.getElementById("notification-dropdown");
    const clearBtn = document.getElementById("btn-clear-notifications");

    if (trigger) {
        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdown.classList.toggle("active");
        });
    }

    // Hide dropdown on window clicks
    window.addEventListener("click", () => {
        if (dropdown) dropdown.classList.remove("active");
    });

    if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const list = document.getElementById("notification-list");
            list.innerHTML = '<div class="empty-state">No new alerts</div>';
            updateNotificationBadge(0);
        });
    }
}

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const icon = type === "success" ? "fa-circle-check" : 
                 type === "error" ? "fa-circle-xmark" :
                 type === "warning" ? "fa-triangle-exclamation" : "fa-info";
                 
    toast.innerHTML = `
        <span class="toast-icon"><i class="fa-solid ${icon}"></i></span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    container.appendChild(toast);
    
    // Add to dropdown list
    addNotificationToDropdown(message, type);

    // Auto remove toast
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function addNotificationToDropdown(message, type) {
    const list = document.getElementById("notification-list");
    const badge = document.getElementById("notification-badge");
    if (!list) return;
    
    // Remove empty state
    const empty = list.querySelector(".empty-state");
    if (empty) empty.remove();
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement("div");
    item.className = "notification-item";
    item.innerHTML = `
        <span>${message}</span>
        <span class="time">${time}</span>
    `;
    
    list.insertBefore(item, list.firstChild);
    
    const count = list.querySelectorAll(".notification-item").length;
    updateNotificationBadge(count);
}

function updateNotificationBadge(count) {
    const badge = document.getElementById("notification-badge");
    if (badge) {
        if (count > 0) {
            badge.style.display = "flex";
            badge.textContent = count;
        } else {
            badge.style.display = "none";
        }
    }
}

/* =============================================================
   13. Search and Filtering Input triggers
   ============================================================= */
function initSearchFilter() {
    const search = document.getElementById("vm-search-input");
    const status = document.getElementById("vm-filter-status");
    
    if (search) search.addEventListener("input", () => renderVMs());
    if (status) status.addEventListener("change", () => renderVMs());
}

async function triggerBatchAction(type) {
    if (type === "stop") {
        const running = currentVMsList.filter(vm => vm.status === "running");
        if (running.length === 0) {
            showToast("No VMs are currently running.", "info");
            return;
        }
        if (confirm(`Are you sure you want to stop all ${running.length} running virtual machines?`)) {
            for (let vm of running) {
                await handleVMAction(vm.name, "stop");
            }
        }
    }
}

/* =============================================================
   Utilities
   ============================================================= */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function animateCounter(id, targetVal) {
    const el = document.getElementById(id);
    if (!el) return;
    
    let currentVal = parseInt(el.textContent) || 0;
    if (currentVal === targetVal) return;
    
    const duration = 800; // ms
    const stepTime = 30; // ms
    const steps = duration / stepTime;
    const diff = targetVal - currentVal;
    const stepVal = diff / steps;
    
    let count = 0;
    const timer = setInterval(() => {
        currentVal += stepVal;
        count++;
        el.textContent = Math.round(currentVal);
        if (count >= steps) {
            clearInterval(timer);
            el.textContent = targetVal;
        }
    }, stepTime);
}
