/**
 * ⚡ SPARK_Labs Sentinel: Script C - The Installer (UI Generator)
 * =============================================================
 * VERSION: v1.0 (BETA)
 * TARGET:  Shelly Gen3 / Gen4
 * * DESCRIPTION:
 * A one-time utility script that automatically builds the Virtual Interface
 * (Buttons, Status displays, History logs) in the Shelly Smart Control App.
 * * INSTRUCTIONS:
 * 1. RUN this script ONCE.
 * 2. Watch the Console for "INSTALLATION COMPLETE".
 * 3. STOP and DELETE this script (it is no longer needed).
 * 4. Refresh your Shelly App to see the new controls.
 * * ⚠️ WARNING:
 * If you run this twice, it may create duplicate components. 
 * If you need to reset, manually delete the "Door Control" group components 
 * in the App first.
 */

// ========================================================================
// 🎨 UI CONFIGURATION
// ========================================================================
const CONFIG = {
  GROUP_NAME: "Door Control",
  
  // COMPONENT KEYS
  // ⚠��� DO NOT EDIT these IDs (200, 201). Script B (The Brain) relies on them.
  KEYS: [
    "boolean:200", // Door Sensor
    "enum:200",    // Status Display
    "button:200",  // Virtual Keypad
    "text:200",    // Timestamp
    "enum:201",    // History Log
    "text:201"     // Visual Feedback
  ],

  // 1. STATUS DISPLAY CONFIG
  STATUS_CONFIG: {
    name: "Status",
    default_value: " System Ready",
    options: ["Error ", " System Ready", "Input Active", "Locked Out", "Success"],
    meta: { 
      ui: { 
        view: "label", // Read-only label
        titles: {
          // You can change the Emoji here, but keep the Keys (left side) exact.
          "Error ":       "⚠️ Error",
          " System Ready":"🔒 Ready",
          "Input Active": "⏰ Typing...",
          "Locked Out":   "⛔ Locked Out",
          "Success":      "👍 Unlocked"
        }
      } 
    }
  },

  // 2. USER HISTORY CONFIG
  HISTORY_CONFIG: {
    name: "User History",
    default_value: "Manual",
    // ⚠️ CRITICAL: The 'options' list must match 'slot' in Script B exactly.
    options: ["User 1", "User 2", "User 3", "User 4", "User 5", "Manual", "Lock out", "Fail "],
    meta: { 
      cloud: ["log"], // Enables cloud logging for this component
      ui: { 
        view: "label", 
        titles: {
          // ✏️ EDIT HERE: Customize the Display Names for your family.
          // The LEFT side must match the 'options' above.
          // The RIGHT side is what you see in the App.
          "User 1":   "👤 Dad",
          "User 2":   "👤 Mum",
          "User 3":   "👤 Kid 1",
          "User 4":   "👤 Kid 2",
          "User 5":   "👤 Guest",
          "Manual":   "🖐️ Manual Key",
          "Lock out": "⛔ SYSTEM LOCK",
          "Fail ":    "❌ Failed Code"
        }
      } 
    }
  }
};

// ========================================================================
// ⚙️ RPC INSTALLATION ENGINE (DO NOT EDIT)
// ========================================================================
let queue = [];

function add(method, params, logMsg) {
  queue.push({ m: method, p: params, l: logMsg });
}

function processQueue() {
  if (queue.length === 0) {
    console.log("------------------------------------------------");
    console.log("✅ INSTALLATION COMPLETE");
    console.log("⏳ Verifying configuration in 2 seconds...");
    
    Timer.set(2000, false, function() {
        Shelly.call("Shelly.GetComponents", {}, function(res, err) {
            if (err) console.log("❌ Verify Failed: " + JSON.stringify(err));
            else {
                console.log("📋 SYSTEM CONFIG GENERATED. CHECKING...");
                // Simple check for Group 200 existence
                let hasGroup = false;
                for(let i=0; i<res.components.length; i++) {
                    if (res.components[i].key === "group:200") hasGroup = true;
                }
                if (hasGroup) console.log("✅ Group 200 Confirmed.");
                else console.log("⚠️ Warning: Group 200 not found in dump.");
                
                console.log("------------------------------------------------");
                console.log("👉 ACTION REQUIRED: You may now DELETE this script.");
                console.log("👉 ACTION REQUIRED: Refresh your Shelly App/WebUI.");
            }
            // Auto-stop the script to prevent accidental re-runs
            Shelly.call("Script.Stop", { id: Shelly.getCurrentScriptId() });
        });
    });
    return;
  }

  let task = queue.splice(0, 1)[0]; 
  if (task.l) console.log(">> " + task.l);

  Shelly.call(task.m, task.p, function(res, err) {
    if (err) {
      let errMsg = typeof err === 'object' ? JSON.stringify(err) : err;
      console.log("⚠️ Error: " + errMsg);
    }
    // Small delay between creates to ensure database consistency
    Timer.set(1000, false, processQueue);
  });
}

// ========================================================================
// 🚀 INSTALLATION SEQUENCE
// ========================================================================
function init() {
  console.log("--- ⚡️SPARK Sentinel V1 Installer ---");

  // 1. Door Sensor (Strictly Label/Read-Only)
  add("Virtual.Add", { 
    type: "boolean", id: 200, 
    config: { 
      name: "Door State", 
      default_value: false, 
      meta: { ui: { view: "label", titles: [" ", " "], webIcon: 2 } } 
    } 
  }, "Creating Boolean:200 (Door)");

  // 2. Status
  add("Virtual.Add", { 
    type: "enum", id: 200, 
    config: CONFIG.STATUS_CONFIG 
  }, "Creating Enum:200 (Status)");

  // 3. Keypad
  add("Virtual.Add", { 
    type: "button", id: 200, 
    config: { name: "Keypad", meta: { ui: { view: "label" } } } 
  }, "Creating Button:200 (Keypad)");

  // 4. Time
  add("Virtual.Add", { 
    type: "text", id: 200, 
    config: { name: "Timestamp", default_value: "--:--", meta: { ui: { view: "label" } } } 
  }, "Creating Text:200 (Time)");

  // 5. History
  add("Virtual.Add", { 
    type: "enum", id: 201, 
    config: CONFIG.HISTORY_CONFIG 
  }, "Creating Enum:201 (History)");

  // 6. Visuals
  add("Virtual.Add", { 
    type: "text", id: 201, 
    config: { name: "Visuals", default_value: "...", meta: { ui: { view: "label" } } } 
  }, "Creating Text:201 (Visuals)");

  // 7. Create Group
  add("Virtual.Add", { 
    type: "group", id: 200, 
    config: { name: CONFIG.GROUP_NAME } 
  }, "Creating Group:200");

  // 8. Link Group
  add("Group.Set", { 
    id: 200, 
    value: CONFIG.KEYS 
  }, "🔗 LINKING Components to Group...");

  processQueue();
}

init();