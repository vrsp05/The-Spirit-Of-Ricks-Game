// ==============================================================================
// PHASE 5: STANDALONE BLUETOOTH LOW ENERGY (BLE) GAMEPAD CONNECTION TEST
// Goal: Verify the ESP32 advertises over Bluetooth, pairs with Windows/Mac,
//       and sends a simulated button press every 2 seconds without any hardware.
// ==============================================================================

#include <Arduino.h>
#include <BleGamepad.h> // Includes the ESP32-BLE-Gamepad library (uses NimBLE)

// ------------------------------------------------------------------------------
// 1. INITIALIZE THE BLUETOOTH GAMEPAD OBJECT
// ------------------------------------------------------------------------------
// Parameters:
//   1. "Spirit of Ricks Pad 1" -> The Bluetooth name you will see on the laptop
//   2. "BYUI-iHACK"            -> Manufacturer name
//   3. 100                     -> Initial simulated battery percentage (100%)
BleGamepad bleGamepad("Spirit of Ricks Pad 2", "BYUI-iHACK", 100);

// We also use the Green Power LED (GPIO 17) as a visual Bluetooth status light:
//   - Blinking = Waiting to pair
//   - Solid ON = Connected to laptop!
const int BLE_STATUS_LED = 17;

// Track connection state changes so the Serial Monitor only prints when it changes
bool wasConnectedLastLoop = false;

// ==============================================================================
// SETUP: RUNS ONCE ON BOOT
// ==============================================================================
void setup() {
  // Start Serial Monitor at 115200 baud for live Bluetooth debugging
  Serial.begin(115200);
  delay(500);

  Serial.println("==========================================================");
  Serial.println("Phase 5: Standalone BLE Gamepad Test Initialized");
  Serial.println("==========================================================");

  // Configure GPIO 17 (Green LED) to show Bluetooth connection status
  pinMode(BLE_STATUS_LED, OUTPUT);
  digitalWrite(BLE_STATUS_LED, LOW);

  // Start advertising the ESP32 as a standard Bluetooth HID Gamepad
  Serial.println("Starting BLE Gamepad service...");
  bleGamepad.begin();
  Serial.println("BLE Active! Open laptop Bluetooth settings and pair with:");
  Serial.println("  --> 'Spirit of Ricks Pad 2'");
}

// ==============================================================================
// LOOP: RUNS CONTINUOUSLY
// ==============================================================================
void loop() {
  // ----------------------------------------------------------------------------
  // CASE A: ESP32 IS CONNECTED TO THE LAPTOP VIA BLUETOOTH
  // ----------------------------------------------------------------------------
  if (bleGamepad.isConnected()) {
    
    // Print a confirmation banner the exact moment Bluetooth connects
    if (!wasConnectedLastLoop) {
      Serial.println("\n[CONNECTED!] Laptop paired with 'Spirit of Ricks Pad 2'!");
      digitalWrite(BLE_STATUS_LED, HIGH); // Keep Green LED solid ON while paired
      wasConnectedLastLoop = true;
    }

    // --- VIRTUAL HEARTBEAT TEST (No physical buttons needed) ---
    // 1. Virtually press Gamepad Button 1
    Serial.println("[BLE TEST] Sending Virtual BUTTON_1 PRESS...");
    bleGamepad.press(BUTTON_2);
    delay(500); // Hold virtual button down for 0.5 seconds

    // 2. Virtually release Gamepad Button 1
    Serial.println("[BLE TEST] Sending Virtual BUTTON_1 RELEASE...");
    bleGamepad.release(BUTTON_1);
    delay(1500); // Wait 1.5 seconds before the next virtual press
  } 
  // ----------------------------------------------------------------------------
  // CASE B: ESP32 IS WAITING FOR BLUETOOTH PAIRING
  // ----------------------------------------------------------------------------
  else {
    if (wasConnectedLastLoop) {
      Serial.println("\n[DISCONNECTED] Lost Bluetooth connection. Advertising again...");
      wasConnectedLastLoop = false;
    }

    // Print a waiting message and blink the Green LED (GPIO 17) every 500ms
    Serial.println("[WAITING] Advertising as 'Spirit of Ricks Pad 2'...");
    digitalWrite(BLE_STATUS_LED, !digitalRead(BLE_STATUS_LED));
    delay(500);
  }
}