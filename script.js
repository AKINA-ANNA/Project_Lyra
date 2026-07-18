/* -------------------------------------------------------------
   VM Portal - Landing Page Interactivity Script
   Features: Particle Engine, Mouse Glowing Light, 3D Tilt Card, Agent Verification
   ------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    initParticles();
    initMouseGlow();
    initTiltCard();
    initAgentChecker();
    initBypassFlows();
});

/* =============================================================
   1. Particle Engine (Background Animation)
   ============================================================= */
function initParticles() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let particles = [];
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.radius = Math.random() * 1.5 + 0.5;
            this.alpha = Math.random() * 0.5 + 0.1;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Bounce check
            if (this.x < 0 || this.x > canvas.width) this.vx = -this.vx;
            if (this.y < 0 || this.y > canvas.height) this.vy = -this.vy;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 240, 255, ${this.alpha})`;
            ctx.fill();
        }
    }

    // Initialize particles
    const count = Math.min(80, Math.floor(window.innerWidth / 15));
    for (let i = 0; i < count; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw connections
        ctx.strokeStyle = "rgba(138, 43, 226, 0.05)";
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }

        particles.forEach(p => {
            p.update();
            p.draw();
        });

        requestAnimationFrame(animate);
    }
    
    animate();
}

/* =============================================================
   2. Mouse Glow Light
   ============================================================= */
function initMouseGlow() {
    const glow = document.getElementById("mouse-glow");
    if (!glow) return;

    window.addEventListener("mousemove", (e) => {
        // Move glow centered under cursor
        glow.style.left = `${e.clientX + window.scrollX}px`;
        glow.style.top = `${e.clientY + window.scrollY}px`;
    });
}

/* =============================================================
   3. 3D Card Tilt Effect
   ============================================================= */
function initTiltCard() {
    const card = document.getElementById("hero-vm-card");
    if (!card) return;

    card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left; // x coordinate inside element
        const y = e.clientY - rect.top;  // y coordinate inside element
        
        const width = rect.width;
        const height = rect.height;
        
        // Convert to percentage values (-15deg to 15deg)
        const rotateX = -(y - height / 2) / (height / 2) * 12;
        const rotateY = (x - width / 2) / (width / 2) * 12;

        card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener("mouseleave", () => {
        card.style.transform = "rotateX(2deg) rotateY(-5deg) scale3d(1, 1, 1)";
    });
}

/* =============================================================
   4. Agent Connections Checker Widget
   ============================================================= */
const AGENT_API = "http://127.0.0.1:8000";

async function verifyAgentConnection() {
    const statusText = document.getElementById("agent-status-indicator");
    const verifyBtn = document.getElementById("btn-verify-connection");
    
    // Status items elements
    const checkAgent = document.getElementById("check-agent-running");
    const checkVBox = document.getElementById("check-vbox-installed");
    const checkMaster = document.getElementById("check-templates-discovered");
    const checkSnap = document.getElementById("check-snapshot-verified");

    // Clear statuses
    const items = [checkAgent, checkVBox, checkMaster, checkSnap];
    items.forEach(item => {
        if (!item) return;
        item.className = "check-item pending-check";
        item.querySelector(".check-status").innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    });

    if (statusText) {
        statusText.className = "status-badge status-checking";
        statusText.innerHTML = '<span class="pulse-indicator"></span> Validating...';
    }
    if (verifyBtn) verifyBtn.disabled = true;

    try {
        const response = await fetch(`${AGENT_API}/health`);
        if (!response.ok) throw new Error("Agent health response failed");
        
        const health = await response.json();
        
        // 1. Agent check
        setCheckState(checkAgent, true);
        
        // 2. VBox Installed check
        setCheckState(checkVBox, health.vbox_installed);
        
        // 3. Templates Discovered check
        setCheckState(checkMaster, health.master_vms_count > 0);
        
        // 4. Required snapshot check
        setCheckState(checkSnap, health.required_snapshot_ok);

        const allOk = health.vbox_installed && health.master_vms_count > 0 && health.required_snapshot_ok;
        
        if (statusText) {
            if (allOk) {
                statusText.className = "status-badge status-online";
                statusText.innerHTML = '<i class="fa-solid fa-circle-check"></i> Connected';
                updateWizardSteps(100);
            } else {
                statusText.className = "status-badge status-offline";
                statusText.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Partially Configured';
                updateWizardSteps(50);
            }
        }
        
        return { success: true, allOk, health };
    } catch (err) {
        items.forEach(item => setCheckState(item, false));
        if (statusText) {
            statusText.className = "status-badge status-offline";
            statusText.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Offline';
        }
        updateWizardSteps(0);
        return { success: false, allOk: false, health: null };
    } finally {
        if (verifyBtn) verifyBtn.disabled = false;
    }
}

function setCheckState(element, isSuccess) {
    if (!element) return;
    if (isSuccess) {
        element.className = "check-item success-check";
        element.querySelector(".check-status").innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    } else {
        element.className = "check-item fail-check";
        element.querySelector(".check-status").innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    }
}

function updateWizardSteps(percentage) {
    const s1 = document.getElementById("wizard-step-1");
    const s2 = document.getElementById("wizard-step-2");
    const s3 = document.getElementById("wizard-step-3");
    const s4 = document.getElementById("wizard-step-4");

    const steps = [s1, s2, s3, s4];
    steps.forEach(s => { if (s) s.className = "wizard-step-item"; });

    if (percentage >= 25 && s1) s1.className = "wizard-step-item success-step";
    if (percentage >= 50 && s2) s2.className = "wizard-step-item success-step";
    if (percentage >= 75 && s3) s3.className = "wizard-step-item success-step";
    if (percentage >= 100 && s4) s4.className = "wizard-step-item success-step";
}

function initAgentChecker() {
    const verifyBtn = document.getElementById("btn-verify-connection");
    if (verifyBtn) {
        verifyBtn.addEventListener("click", () => verifyAgentConnection());
    }
    // Poll agent check once on load
    verifyAgentConnection();
}

/* =============================================================
   5. Login, Dev Bypass, & Onboarding Interceptors
   ============================================================= */
function initBypassFlows() {
    const bypassBtn = document.getElementById("bypass-login-btn");
    const loginGoogle = document.getElementById("login-google-btn");
    const loginGithub = document.getElementById("login-github-btn");
    
    // Onboarding panel buttons
    const retryOnboarding = document.getElementById("btn-onboarding-retry");
    const proceedOnboarding = document.getElementById("btn-onboarding-proceed");
    const onboardingOverlay = document.getElementById("onboarding-overlay");

    // Setup visual triggers
    function runPostAuthFlow() {
        // Mock session write
        sessionStorage.setItem("vm_portal_user", JSON.stringify({
            name: "Developer Admin",
            email: "admin@vmportal.local",
            photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80"
        }));
        
        // Open connecting modal
        if (onboardingOverlay) onboardingOverlay.classList.add("active");
        verifyOnboardingConnection();
    }

    if (bypassBtn) bypassBtn.addEventListener("click", runPostAuthFlow);
    if (loginGoogle) loginGoogle.addEventListener("click", runPostAuthFlow);
    if (loginGithub) loginGithub.addEventListener("click", runPostAuthFlow);

    if (retryOnboarding) {
        retryOnboarding.addEventListener("click", () => verifyOnboardingConnection());
    }

    if (proceedOnboarding) {
        proceedOnboarding.addEventListener("click", () => {
            window.location.href = "dashboard.html";
        });
    }
}

async function verifyOnboardingConnection() {
    const proceedBtn = document.getElementById("btn-onboarding-proceed");
    const retryBtn = document.getElementById("btn-onboarding-retry");

    const checkAgent = document.getElementById("mini-check-agent");
    const checkVbox = document.getElementById("mini-check-vbox");
    const checkMaster = document.getElementById("mini-check-master");
    const checkSnap = document.getElementById("mini-check-snap");

    const items = [checkAgent, checkVbox, checkMaster, checkSnap];
    items.forEach(it => {
        if (!it) return;
        it.className = "mini-check";
        it.querySelector(".icon-circle").innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    });

    if (retryBtn) retryBtn.disabled = true;

    try {
        const response = await fetch(`${AGENT_API}/health`);
        if (!response.ok) throw new Error("Agent Offline");
        
        const health = await response.json();
        
        // Set mini-checks
        setMiniCheckState(checkAgent, true);
        setMiniCheckState(checkVbox, health.vbox_installed);
        setMiniCheckState(checkMaster, health.master_vms_count > 0);
        setMiniCheckState(checkSnap, health.required_snapshot_ok);

        const allOk = health.vbox_installed && health.master_vms_count > 0 && health.required_snapshot_ok;
        
        if (proceedBtn) {
            if (allOk) {
                proceedBtn.disabled = false;
                proceedBtn.className = "btn btn-glow";
                // Trigger auto redirect after 1.5 seconds if everything is verified!
                setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 1500);
            } else {
                proceedBtn.disabled = true;
                proceedBtn.className = "btn btn-secondary";
            }
        }
    } catch (err) {
        items.forEach(it => setMiniCheckState(it, false));
        if (proceedBtn) {
            proceedBtn.disabled = true;
            proceedBtn.className = "btn btn-secondary";
        }
    } finally {
        if (retryBtn) retryBtn.disabled = false;
    }
}

function setMiniCheckState(element, isSuccess) {
    if (!element) return;
    if (isSuccess) {
        element.className = "mini-check pass";
        element.querySelector(".icon-circle").innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    } else {
        element.className = "mini-check fail";
        element.querySelector(".icon-circle").innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    }
}

function scrollToSection(id) {
    const element = document.getElementById(id);
    if (element) {
        element.scrollIntoView({ behavior: "smooth" });
    }
}
