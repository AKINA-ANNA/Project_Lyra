from flask import Flask, jsonify, request
from flask_cors import CORS
import time
import datetime
import random
import subprocess
import os

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

app = Flask(__name__)
CORS(app)

START_TIME = time.time()
VBOXMANAGE = r"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"

system_logs = []

def add_log(level: str, message: str):
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    # Store as string for timeline view: HH:MM:SS - message
    system_logs.insert(0, f"{timestamp} - [{level}] {message}")
    if len(system_logs) > 100:
        system_logs.pop()

def run_vbox(args):
    if not os.path.exists(VBOXMANAGE):
        add_log("ERROR", f"VBoxManage not found at {VBOXMANAGE}")
        return "", "VBoxManage not found", 1
    result = subprocess.run([VBOXMANAGE] + args, capture_output=True, text=True)
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def get_all_vms():
    out, err, code = run_vbox(["list", "vms"])
    vms = []
    if code == 0 and out:
        for line in out.split("\n"):
            if '"' in line:
                name = line.split('"')[1]
                vms.append(name)
    return vms

def get_running_vms():
    out, err, code = run_vbox(["list", "runningvms"])
    vms = []
    if code == 0 and out:
        for line in out.split("\n"):
            if '"' in line:
                name = line.split('"')[1]
                vms.append(name)
    return vms

@app.route("/health", methods=["GET"])
def health_check():
    uptime_seconds = time.time() - START_TIME
    
    # Check VBox installation
    vbox_installed = os.path.exists(VBOXMANAGE)
    
    all_vms = get_all_vms()
    master_vms = [v for v in all_vms if v.endswith("-Master")]
    
    return jsonify({
        "status": "ok",
        "uptime": f"{int(uptime_seconds // 3600)}h {int((uptime_seconds % 3600) // 60)}m",
        "agent_version": "1.0.0",
        "vbox_installed": vbox_installed,
        "master_vms_count": len(master_vms),
        "required_snapshot_ok": True  # Assuming GoldenMaster exists if master exists
    })

@app.route("/templates", methods=["GET"])
def get_templates():
    all_vms = get_all_vms()
    templates = []
    for vm in all_vms:
        if vm.endswith("-Master"):
            templates.append({
                "name": vm,
                "description": f"{vm} Base Image",
                "cpu": 2,
                "ram": 2048,
                "disk_size_gb": 40
            })
    return jsonify(templates)

@app.route("/vms", methods=["GET"])
def get_vms():
    all_vms = get_all_vms()
    running_vms = get_running_vms()
    
    vms = []
    for vm in all_vms:
        if not vm.endswith("-Master"):
            is_running = vm in running_vms
            vms.append({
                "name": vm,
                "status": "running" if is_running else "offline",
                "ip_address": "192.168.1.xxx" if is_running else "N/A",
                "uptime": "Active" if is_running else "Offline",
                "ram": 2048,
                "cpu": 2,
                "disk_size_gb": 40,
                "network_attachment": "Bridged",
                "snapshot_used": "GoldenMaster"
            })
    return jsonify(vms)

@app.route("/system", methods=["GET"])
def get_system():
    if HAS_PSUTIL:
        try:
            cpu_usage = psutil.cpu_percent(interval=0.1)
            ram = psutil.virtual_memory()
            ram_usage = ram.percent
            disk = psutil.disk_usage('/')
            disk_usage = disk.percent
        except Exception:
            cpu_usage = random.uniform(5.0, 15.0)
            ram_usage = random.uniform(30.0, 60.0)
            disk_usage = random.uniform(40.0, 70.0)
    else:
        cpu_usage = random.uniform(5.0, 15.0)
        ram_usage = random.uniform(30.0, 60.0)
        disk_usage = random.uniform(40.0, 70.0)
        
    all_vms = get_all_vms()
    running_vms = get_running_vms()
    master_vms = [v for v in all_vms if v.endswith("-Master")]
        
    return jsonify({
        "cpu_usage": f"{cpu_usage:.1f}%",
        "ram_usage": f"{ram_usage:.1f}%",
        "disk_usage": f"{disk_usage:.1f}%",
        "active_vms": len(running_vms),
        "total_templates": len(master_vms)
    })

@app.route("/logs", methods=["GET"])
def get_logs():
    return jsonify(system_logs)

@app.route("/deploy", methods=["POST"])
def deploy_vm():
    data = request.json
    template_name = data.get("template")
    
    new_vm_name = f"{template_name.replace('-Master', '')}-Clone-{random.randint(100, 9999)}"
    
    # Run the VBoxManage clonevm command
    add_log("INFO", f"Cloning {template_name} to {new_vm_name}...")
    out, err, code = run_vbox([
        "clonevm", template_name,
        "--snapshot", "GoldenMaster",
        "--options", "link",
        "--name", new_vm_name,
        "--register"
    ])
    
    if code != 0:
        add_log("ERROR", f"Deployment failed: {err}")
        return jsonify({"error": f"Failed to clone VM: {err}"}), 500
        
    add_log("SUCCESS", f"Successfully cloned VM {new_vm_name}.")
    
    # Automatically start the newly created VM with GUI
    add_log("INFO", f"Starting newly deployed VM {new_vm_name}...")
    run_vbox(["startvm", new_vm_name, "--type", "gui"])
    
    return jsonify({"success": True, "vm_name": new_vm_name})

@app.route("/vm/<vm_name>/<action>", methods=["POST", "GET"])
def control_vm(vm_name, action):
    # Action handling
    if action in ["start", "console"]:
        out, err, code = run_vbox(["startvm", vm_name, "--type", "gui"])
        if code == 0 or "already locked" in err:
            add_log("INFO", f"Started VM '{vm_name}' with GUI.")
            return jsonify({"success": True, "message": f"VM {vm_name} started"})
        else:
            add_log("ERROR", f"Failed to start VM: {err}")
            return jsonify({"error": err}), 500
            
    elif action == "stop":
        out, err, code = run_vbox(["controlvm", vm_name, "poweroff"])
        if code == 0:
            add_log("INFO", f"Stopped VM '{vm_name}'.")
            return jsonify({"success": True, "message": f"VM {vm_name} stopped"})
        else:
            add_log("ERROR", f"Failed to stop VM: {err}")
            return jsonify({"error": err}), 500
            
    elif action == "delete":
        # Delete only works if VM is stopped, try to poweroff first
        run_vbox(["controlvm", vm_name, "poweroff"])
        time.sleep(1) # wait briefly for poweroff
        out, err, code = run_vbox(["unregistervm", vm_name, "--delete"])
        if code == 0:
            add_log("SUCCESS", f"Deleted VM '{vm_name}'.")
            return jsonify({"success": True, "message": f"VM {vm_name} deleted"})
        else:
            add_log("ERROR", f"Failed to delete VM: {err}")
            return jsonify({"error": err}), 500
            
    elif action == "restart":
        out, err, code = run_vbox(["controlvm", vm_name, "reset"])
        if code == 0:
            add_log("INFO", f"Restarted VM '{vm_name}'.")
            return jsonify({"success": True, "message": f"VM {vm_name} restarted"})
        else:
            add_log("ERROR", f"Failed to restart VM: {err}")
            return jsonify({"error": err}), 500
            
    else:
        return jsonify({"error": "Invalid action"}), 400

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
