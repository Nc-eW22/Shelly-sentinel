/**
 * ⚡ SPARK_Labs Sentinel: Script D - The Simulator (QA Tool)
 * ==========================================================
 * VERSION: v1.0 (BETA)
 * TARGET:  Shelly Gen3 / Gen4
 * * DESCRIPTION:
 * A Quality Assurance tool that runs an "Auto-Pilot" demo. 
 * It injects synthetic events to test the logic of Script B (The Brain).
 * * USAGE:
 * 1. Ensure Script B (Brain) is RUNNING.
 * 2. Run this script.
 * 3. Watch the Console and the App UI to see the "Ghost" operate.
 * * ⚠️ WARNING:
 * NEVER enable "Run on start" for this script. It is for testing only.
 */

const CONFIG = {
  // 🎭 MOCK HARDWARE ADDRESSES
  // To test effectively, these MACs must match the ones defined in 
  // Script B (The Brain). The Simulator pretends to be these devices.
  MACS: {
    USER_1: "mac_address_user_1", // The Admin User
    USER_2: "mac_address_user_2",
    USER_3: "mac_address_user_3",
    USER_4: "mac_address_user_4",
    USER_5: "mac_address_user_5",
    DOOR:   "mac_address_door_sensor"
  },
  
  PRESS_DELAY: 800,    // Simulated typing speed (ms)
  SCENARIO_GAP: 5000   // Wait time between scenarios (ms)
};

// ========================================================================
// ⚙️ SIMULATION ENGINE (THE GHOST)
// ========================================================================
let SIM = {
  _timer: null,
  _queue: [], 

  /**
   * INJECT BLE EVENT
   * Bypasses the physical radio and sends a fake 'custom_ble_bridge' event
   * directly to the Event Bus, fooling Script B.
   */
  emitBLE: function(mac, type, state) {
    let payload = { mac: mac, type: type };
    if (state !== undefined) payload.state = state;
    console.log("📡 BLE: " + type + " (" + mac + ")");
    Shelly.emitEvent("custom_ble_bridge", payload);
  },

  /**
   * INJECT VIRTUAL APP EVENT
   * Simulates a user pressing the virtual button in the Shelly App.
   */
  emitVirtual: function(event) {
    console.log("📱 APP: " + event);
    Shelly.call("Button.Trigger", { id: 200, event: event });
  },

  // Sequence Runner (Recursive Daisy-Chain)
  _runSequence: function(steps, idx, onComplete) {
    if (this._timer) { Timer.clear(this._timer); this._timer = null; }
    if (!idx) idx = 0;
    
    // Check if sequence is finished
    if (idx >= steps.length) {
      console.log("   -> Sequence Done. Cooling down (" + (CONFIG.SCENARIO_GAP/1000) + "s)...");
      this._timer = Timer.set(CONFIG.SCENARIO_GAP, false, function() {
        if (onComplete) onComplete();
      });
      return;
    }

    // Execute Step
    let step = steps[idx];
    let actionDelay = step.ms || CONFIG.PRESS_DELAY;

    if (step.action === "ble") this.emitBLE(step.mac, step.type, step.state);
    if (step.action === "virtual") this.emitVirtual(step.type);
    if (step.action === "log") console.log(step.msg);

    // Schedule next step
    this._timer = Timer.set(actionDelay, false, function() {
      SIM._runSequence(steps, idx + 1, onComplete);
    });
  },

  // Queue Manager
  runNextScenario: function() {
    if (SIM._queue.length === 0) {
      // --- TIME TRAVEL TEST ---
      // At the end of the demo, we inject a fake history record from yesterday
      // to verify the "Smart Time" logic (e.g., displaying "T-1") works.
      console.log("\n🎬 SCENARIO: Time Travel Injection");
      let yesterday = Date.now() - (25 * 60 * 60 * 1000); 
      let record = { u: "User 1", t: yesterday };
      Script.storage.setItem("access_hist", JSON.stringify(record));
      
      console.log("✅ Injected: " + JSON.stringify(record));
      console.log("⚠️ RESTART SCRIPT B TO SEE 'T-1' TIMESTAMP IN UI");
      console.log("------------------------------------------------");
      console.log("🏁 DEMO COMPLETE");
      return;
    }

    let scenario = SIM._queue.splice(0, 1)[0]; 
    console.log("\n🎬 SCENARIO: " + scenario.name);
    
    SIM._runSequence(scenario.steps, 0, function() {
      SIM.runNextScenario();
    });
  },

  addToQueue: function(name, steps) {
    this._queue.push({ name: name, steps: steps });
  }
};

// ========================================================================
// 🎬 AUTO-PILOT SCENARIOS
// ========================================================================
function startAutoPilot() {
  console.log("------------------------------------------------");
  console.log("⚡️ SPARK SENTINEL: SIMULATOR V1.0");
  console.log("------------------------------------------------");

  // 1. HAPPY PATH (Admin Access)
  // Simulates User 1 entering the correct code.
  SIM.addToQueue("User 1 (Admin) Access", [
    { action: "ble", mac: CONFIG.MACS.USER_1, type: "double_push" },
    { action: "ble", mac: CONFIG.MACS.USER_1, type: "single_push" },
    { action: "ble", mac: CONFIG.MACS.USER_1, type: "double_push" }
  ]);

  // 2. SECURITY TEST (Intruder)
  // Simulates an unknown or wrong button pressing 3 times.
  // Should trigger LOCKOUT state.
  SIM.addToQueue("Intruder Alert (Wrong Code)", [
    { action: "ble", mac: "bad_mac_addr", type: "single_push" },
    { action: "ble", mac: "bad_mac_addr", type: "single_push" },
    { action: "ble", mac: "bad_mac_addr", type: "single_push" }
  ]);

  // 3. VIRTUAL KEYPAD TEST
  // Simulates unlocking via the App UI.
  SIM.addToQueue("Virtual App Unlock", [
    { action: "virtual", type: "double_push" },
    { action: "virtual", type: "single_push" },
    { action: "virtual", type: "double_push" }
  ]);

  // 4. MANUAL OVERRIDE TEST
  // Simulates opening the door with a physical key (no button press).
  // Should log "Manual" entry.
  SIM.addToQueue("Manual Entry (Key)", [
    { action: "ble", mac: CONFIG.MACS.DOOR, type: "door_state", state: true, ms: 3000 },
    { action: "ble", mac: CONFIG.MACS.DOOR, type: "door_state", state: false }
  ]);

  // START
  SIM.runNextScenario();
}

console.log("⏳ Demo starting in 3 seconds...");
Timer.set(3000, false, startAutoPilot);