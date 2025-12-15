/**
 * ⚡ SPARK SENTINEL: Visual Feedback Driver
 * ==========================================
 * Version: 1.0 
 * Device: Shelly Pro 4PM / Plus 1
 * Role: Receives HTTP triggers from Sentinel Brain to flash the light.
 */

const CONFIG = {
  id: 0,              // ⚠️ Target Switch ID (Change if your light is on channel 1, 2, etc.)
  slow_ms: 1000,       // Speed of "Slow" toggle
  fast_ms: 700,       // Speed of "Fast" toggle
  pause_ms: 3000      // Pause between loops in Fail 3
};

let STATE = { original: null, active: false, timer: null, loop_timer: null };

// --- HELPERS ---

function log(msg) { 
  console.log("⚡ Sentinel Driver:", msg); 
}

function parseQueryString(str) {
  let params = {};
  if (!str) return params;
  let pairs = str.split('&');
  for (let i = 0; i < pairs.length; i++) {
    let pair = pairs[i].split('=');
    if (pair.length === 2) params[pair[0]] = pair[1];
  }
  return params;
}

// --- STATE MANAGEMENT ---

function saveState() {
  if (STATE.active) return;
  
  // Safety Check: Does the switch exist?
  let status = Shelly.getComponentStatus("switch:" + CONFIG.id);
  if (!status) { 
    console.log("❌ ERROR: Switch ID " + CONFIG.id + " not found! Check CONFIG.id."); 
    return; 
  }
  
  STATE.original = status.output;
  STATE.active = true;
  log("State Saved (Was: " + (STATE.original ? "ON" : "OFF") + ")");
}

function restoreState() {
  stopAll();
  
  if (STATE.original !== null) {
    Shelly.call("Switch.Set", { id: CONFIG.id, on: STATE.original });
    log("Restored -> " + (STATE.original ? "ON" : "OFF"));
  }
  
  STATE.active = false;
  STATE.original = null;
}

function stopAll() {
  if (STATE.timer) { Timer.clear(STATE.timer); STATE.timer = null; }
  if (STATE.loop_timer) { Timer.clear(STATE.loop_timer); STATE.loop_timer = null; }
}

// --- ANIMATION ENGINE ---

function blinkSequence(count, speed, callback) {
  let toggles = 0;
  let max_toggles = count * 2; 

  // Safety Valve: Clear previous timer before starting new one
  if (STATE.timer) Timer.clear(STATE.timer);

  STATE.timer = Timer.set(speed, true, function() {
    Shelly.call("Switch.Toggle", { id: CONFIG.id });
    toggles++;

    if (toggles >= max_toggles) {
      Timer.clear(STATE.timer);
      STATE.timer = null;
      if (callback) callback(); 
    }
  });
}

// --- EVENT HANDLERS ---

function runFail1() { 
  log("Triggering Fail 1 (Warning)"); 
  saveState(); 
  blinkSequence(1, CONFIG.slow_ms, restoreState); 
}

function runFail2() { 
  log("Triggering Fail 2 (Error)"); 
  saveState(); 
  blinkSequence(2, CONFIG.slow_ms, restoreState); 
}

function runFail3() {
  log("Triggering Fail 3 (Lockout)");
  saveState();
  
  function loop() {
    blinkSequence(6, CONFIG.fast_ms, function() {
      STATE.loop_timer = Timer.set(CONFIG.pause_ms, false, loop);
    });
  }
  loop();
}

// --- API REGISTRATION ---

HTTPServer.registerEndpoint("run", function(req, res) {
  // Fire and Forget: Reply immediately to prevent browser timeouts
  res.send("OK"); 

  let params = parseQueryString(req.query);
  let cmd = params.event;

  if (!cmd) return;

  log("✅ Command Received: " + cmd);

  // Decouple logic from request
  Timer.set(10, false, function() {
      if (cmd === "fail1") runFail1();
      else if (cmd === "fail2") runFail2();
      else if (cmd === "fail3") runFail3();
      else if (cmd === "ready") restoreState();
      else log("❓ Unknown command: " + cmd);
  });
});

// --- SPARK STARTUP REPORT ---

function printStartupInfo() {
  let script_id = Shelly.getCurrentScriptId();
  
  Shelly.call("Wifi.GetStatus", {}, function(res) {
    let ip = "0.0.0.0";
    if (res && res.sta_ip) ip = res.sta_ip;
    
    console.log("------------------------------------------------");
    console.log("⚡ SPARK SENTINEL: Light Driver v1.0 Online");
    console.log("------------------------------------------------");
    console.log("📝 Device IP: " + ip);
    console.log("📝 Script ID: " + script_id);
    console.log("🔗 Control Endpoints:");
    console.log("   ⚠️ Fail 1:  http://" + ip + "/script/" + script_id + "/run?event=fail1");
    console.log("   ⚠️ Fail 2:  http://" + ip + "/script/" + script_id + "/run?event=fail2");
    console.log("   🚨 Fail 3:  http://" + ip + "/script/" + script_id + "/run?event=fail3");
    console.log("   ✅ Reset:   http://" + ip + "/script/" + script_id + "/run?event=ready");
    console.log("------------------------------------------------");
  });
}

// Wait for network to settle before printing info
Timer.set(2000, false, printStartupInfo);