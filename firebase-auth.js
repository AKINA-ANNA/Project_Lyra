/* -------------------------------------------------------------
   VM Portal - Firebase Auth Client Helper
   Handles OAuth credentials with automated Developer Fallback
   ------------------------------------------------------------- */

// Optional Firebase Project Config (Replace with real keys if deploying)
const firebaseConfig = {
  apiKey: "AIzaSyAx5tAIq4jvNJKvx7zQgqkMHFboRmAcmqI",
  authDomain: "vm-portal-6c483.firebaseapp.com",
  projectId: "vm-portal-6c483",
  storageBucket: "vm-portal-6c483.firebasestorage.app",
  messagingSenderId: "498447996357",
  appId: "1:498447996357:web:6cda2871effaaad56967ac",
  measurementId: "G-EVFYSWKZ85"
};

let authInstance = null;

// Initialize Firebase if config values are provided
if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "") {
    try {
        firebase.initializeApp(firebaseConfig);
        authInstance = firebase.auth();
    } catch (e) {
        console.warn("Firebase initialization failed. Falling back to Developer Mode.", e);
    }
}

class FirebaseAuthHelper {
    static get isLoggedIn() {
        return sessionStorage.getItem("vm_portal_user") !== null;
    }

    static getUser() {
        const userStr = sessionStorage.getItem("vm_portal_user");
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    static loginDeveloperBypass() {
        const devUser = {
            name: "Developer Admin",
            email: "admin@vmportal.local",
            photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80"
        };
        sessionStorage.setItem("vm_portal_user", JSON.stringify(devUser));
        return Promise.resolve(devUser);
    }

    static googleSignIn() {
        if (!authInstance) {
            console.log("Firebase Auth unavailable. Logging in with bypass.");
            return this.loginDeveloperBypass();
        }
        
        const provider = new firebase.auth.GoogleAuthProvider();
        return authInstance.signInWithPopup(provider).then((result) => {
            const user = {
                name: result.user.displayName,
                email: result.user.email,
                photoURL: result.user.photoURL
            };
            sessionStorage.setItem("vm_portal_user", JSON.stringify(user));
            return user;
        });
    }

    static githubSignIn() {
        if (!authInstance) {
            console.log("Firebase Auth unavailable. Logging in with bypass.");
            return this.loginDeveloperBypass();
        }
        
        const provider = new firebase.auth.GithubAuthProvider();
        return authInstance.signInWithPopup(provider).then((result) => {
            const user = {
                name: result.user.displayName || result.user.email.split('@')[0],
                email: result.user.email,
                photoURL: result.user.photoURL
            };
            sessionStorage.setItem("vm_portal_user", JSON.stringify(user));
            return user;
        });
    }

    static logOut() {
        sessionStorage.removeItem("vm_portal_user");
        if (authInstance) {
            return authInstance.signOut();
        }
        return Promise.resolve();
    }
}

// Attach listener to index.html elements if loaded there
document.addEventListener("DOMContentLoaded", () => {
    const btnGoogle = document.getElementById("login-google-btn");
    const btnGithub = document.getElementById("login-github-btn");
    const btnBypass = document.getElementById("bypass-login-btn");

    if (btnGoogle) {
        btnGoogle.addEventListener("click", () => {
            FirebaseAuthHelper.googleSignIn().then(() => {
                showOnboardingOverlay();
            }).catch(err => console.error("Sign in failed", err));
        });
    }

    if (btnGithub) {
        btnGithub.addEventListener("click", () => {
            FirebaseAuthHelper.githubSignIn().then(() => {
                showOnboardingOverlay();
            }).catch(err => console.error("Sign in failed", err));
        });
    }

    if (btnBypass) {
        btnBypass.addEventListener("click", () => {
            FirebaseAuthHelper.loginDeveloperBypass().then(() => {
                showOnboardingOverlay();
            });
        });
    }
});

function showOnboardingOverlay() {
    const overlay = document.getElementById("onboarding-overlay");
    if (overlay) {
        overlay.classList.add("active");
        if (typeof verifyOnboardingConnection === 'function') {
            verifyOnboardingConnection();
        }
    } else {
        window.location.href = "dashboard.html";
    }
}
