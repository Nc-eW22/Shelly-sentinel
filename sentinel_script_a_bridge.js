/**
 * ⚡ SPARK_Labs Sentinel: Script A - The Bridge (BLE Scanner)
 * ==========================================================
 * VERSION: v1.0 (BETA)
 * TARGET:  Shelly Gen3 / Gen4
 * * DESCRIPTION:
 * This script acts as the "Ear" of the system. It performs high-frequency 
 * Bluetooth Low Energy (BLE) scanning to detect Shelly BLU buttons and sensors.
 * * CORE FUNCTIONS:
 * 1. Scans for BLE advertisements.
 * 2. Filters devices against an ALLOWED MAC address list.
 * 3. Decodes BTHome payloads (Buttons, Windows, Rotation, etc.).
 * 4. Deduplicates events (prevents one click from firing multiple times).
 * 5. Emits a clean 'custom_ble_bridge' event to the Shelly Event Bus.
 */

// ========================================================================
// 🛠️ CONFIGURATION SECTION
// ========================================================================
const CONFIG = {
  // ALLOWED DEVICES LIST
  // ⚠️ CRITICAL INSTALLATION STEP:
  // 1. Enter device MAC addresses in LOWERCASE only (e.g., "aa:bb:cc:11:22:33").
  // 2. Ensure existing MACs are removed or replaced.
  MACS: [
    "mac_address_user_1", // 🟢 User 1 Button (e.g., Dad)
    "mac_address_user_2", // 🟢 User 2 Button (e.g., Mum)
    "mac_address_user_3", // 🟢 User 3 Button
    "mac_address_user_4", // 🟢 User 4 Button
    "mac_address_user_5", // 🟢 User 5 Button
    "mac_address_door_sensor" // 🔵 Door Sensor
  ],
  
  // Set to 'false' to disable console logs once system is stable
  DEBUG: true
};

// ========================================================================
// ⚙️ SYSTEM STATE & UTILITIES (DO NOT EDIT)
// ========================================================================

// Deduplication Buffer
// Stores the last Packet ID (pid) received from each device to ignore duplicates.
let lastPids = {}; 

/**
 * 📦 BTHome Decoder Library
 * Handles the raw byte parsing of the BTHome standard used by Shelly BLU devices.
 * Logic: Unpacks raw hex strings into readable properties (button, battery, window, etc.)
 */
const BTH={0x00:{n:"pid",t:0},0x01:{n:"battery",t:0,u:"%"},0x02:{n:"temperature",t:3,f:0.01,u:"tC"},0x03:{n:"humididity",t:2,f:0.01,u:"%"},0x05:{n:"illuminance",t:4,f:0.01},0x21:{n:"motion",t:0},0x2d:{n:"window",t:0},0x2e:{n:"humidity",t:0,u:"%"},0x3a:{n:"button",t:0},0x3f:{n:"rotation",t:3,f:0.1},0x45:{n:"temperature",t:3,f:0.1,u:"tC"}};
function getByteSize(t){if(t===0||t===1)return 1;if(t===2||t===3)return 2;if(t===4||t===5)return 3;return 255;}
const BTHomeDecoder={utoi:function(num,bitsz){const mask=1<<(bitsz-1);return num&mask?num-(1<<bitsz):num;},getUInt8:function(buffer){return buffer.at(0);},getInt8:function(buffer){return this.utoi(this.getUInt8(buffer),8);},getUInt16LE:function(buffer){return 0xffff&((buffer.at(1)<<8)|buffer.at(0));},getInt16LE:function(buffer){return this.utoi(this.getUInt16LE(buffer),16);},getUInt24LE:function(buffer){return(0x00ffffff&((buffer.at(2)<<16)|(buffer.at(1)<<8)|buffer.at(0)));},getInt24LE:function(buffer){return this.utoi(this.getUInt24LE(buffer),24);},getBufValue:function(type,buffer){if(buffer.length<getByteSize(type))return null;let res=null;if(type===0)res=this.getUInt8(buffer);if(type===1)res=this.getInt8(buffer);if(type===2)res=this.getUInt16LE(buffer);if(type===3)res=this.getInt16LE(buffer);if(type===4)res=this.getUInt24LE(buffer);if(type===5)res=this.getInt24LE(buffer);return res;},unpack:function(buffer){if(typeof buffer!=="string"||buffer.length===0)return null;let result={};let _dib=buffer.at(0);result["encryption"]=_dib&0x1?true:false;result["BTHome_version"]=_dib>>5;if(result["BTHome_version"]!==2)return null;if(result["encryption"])return result;buffer=buffer.slice(1);let _bth,_value;while(buffer.length>0){_bth=BTH[buffer.at(0)];if(typeof _bth==="undefined")break;buffer=buffer.slice(1);_value=this.getBufValue(_bth.t,buffer);if(_value===null)break;if(typeof _bth.f!=="undefined")_value=_value*_bth.f;result[_bth.n]=_value;buffer=buffer.slice(getByteSize(_bth.t));}return result;}};

// ========================================================================
// 📡 MAIN SCANNING LOGIC
// ========================================================================

/**
 * Function: bleScanCallback
 * Triggered every time the scanner detects a BLE packet.
 * * @param {object} event - The type of scan event
 * @param {object} result - The payload containing address, rssi, and service_data
 */
function bleScanCallback(event, result) {
  if (event !== BLE.Scanner.SCAN_RESULT) return;
  
  // 1. SECURITY FILTER
  // Checks if the broadcasting device is in our trusted MACS list.
  let known = false;
  for(let i=0; i<CONFIG.MACS.length; i++) {
    if (result.addr === CONFIG.MACS[i]) known = true;
  }
  if (!known) return;

  // 2. PAYLOAD DECODING
  // Extracts the BTHome data structure from the service data (0xfcd2)
  let servData = result.service_data;
  if (!servData || !servData["fcd2"]) return;

  let data = BTHomeDecoder.unpack(servData["fcd2"]);
  
  // 3. ENCRYPTION CHECK
  // Sentinel relies on sequence security, not packet encryption.
  // We skip encrypted packets to ensure fast processing of raw clicks.
  if (!data || data.encryption) return;

  // 4. DEDUPLICATION
  // Checks the Packet ID (pid). If it matches the last known PID 
  // from this specific MAC address, we ignore it (it's a repeat echo).
  if (lastPids[result.addr] === data.pid) return;
  lastPids[result.addr] = data.pid;

  // 5. EVENT EMISSION
  // If valid, we emit a 'custom_ble_bridge' event for Script B to pick up.
  
  // -- A. HANDLE BUTTON PRESSES --
  if (data.button !== undefined && data.button > 0) {
    let types = ["", "single_push", "double_push", "triple_push", "long_push"];
    let type = types[data.button];
    
    if (CONFIG.DEBUG) console.log(">>> BRIDGE: " + type + " from " + result.addr + " (RSSI: " + result.rssi + ")");
    
    Shelly.emitEvent("custom_ble_bridge", {
      mac: result.addr,
      type: type,
      rssi: result.rssi // Passing RSSI for future location/security checks
    });
  }

  // -- B. HANDLE DOOR/WINDOW SENSORS --
  if (data.window !== undefined) {
    let isOpen = (data.window === 1);
    
    if (CONFIG.DEBUG) console.log(">>> BRIDGE DOOR: " + (isOpen ? "Open" : "Closed") + " from " + result.addr);
    
    Shelly.emitEvent("custom_ble_bridge", {
      mac: result.addr,
      type: "door_state",
      state: isOpen,
      rssi: result.rssi
    });
  }
}

// ========================================================================
// 🚀 EXECUTION START
// ========================================================================
// Infinite scan duration to ensure we never miss a click.
BLE.Scanner.Start({ duration_ms: BLE.Scanner.INFINITE_SCAN, active: true }, bleScanCallback);
console.log("--- ⚡️SPARK Sentinel Bridge v1.0 Running ---");