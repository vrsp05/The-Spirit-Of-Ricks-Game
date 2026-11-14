// ==============================================================================
// MASTER FIRMWARE: BLE GAMEPAD + 4 BUTTONS/LEDS + 2 JOYSTICKS + BATTERY MONITOR
// ==============================================================================

#include <Arduino.h>
#include <BleGamepad.h>

// Change "Pad 1" to "Pad 2" when flashing the second controller
BleGamepad bleGamepad("Spirit of Ricks Pad 1", "BYUI-iHACK", 100);

// ------------------------------------------------------------------------------
// 1. PIN DEFINITIONS
// ------------------------------------------------------------------------------
// Step 1: 4 Action Buttons & 4 Test LEDs (Yellow, Red, Blue, White)
const int NUM_BUTTONS = 4;
const int BUTTON_PINS[NUM_BUTTONS] = {27, 14, 12, 18};
const int LED_PINS[NUM_BUTTONS]    = {16, 2, 4, 15};

// Map our 4 physical buttons to standard BLE Gamepad buttons (Buttons 1, 2, 3, 4)
const uint8_t BLE_BUTTONS[NUM_BUTTONS] = {BUTTON_1, BUTTON_2, BUTTON_3, BUTTON_4};

// Step 2: Dual Joysticks (ADC1 pins only so Bluetooth works)
const int LEFT_JOY_VRX  = 32;
const int LEFT_JOY_VRY  = 33;
const int LEFT_JOY_SW   = 25; // Thumb click L3 (Mapped to BUTTON_5)

const int RIGHT_JOY_VRX = 34;
const int RIGHT_JOY_VRY = 35;
const int RIGHT_JOY_SW  = 26; // Thumb click R3 (Mapped to BUTTON_6)

// Step 3: Battery Voltage Monitor & Green/Red Status LEDs
const int BATTERY_SENSE_PIN = 36; // SVP / VP
const int GREEN_POWER_LED   = 17;
const int RED_LOW_BATT_LED  = 5;

// ------------------------------------------------------------------------------
// 2. CALIBRATION, DEADZONE & TIMING VARIABLES
// ------------------------------------------------------------------------------
int leftCenterX = 2048, leftCenterY = 2048;
int rightCenterX = 2048, rightCenterY = 2048;
const int JOY_DEADZONE = 250; // Filters out stick drift at rest

// Debounce state arrays for the 4 action buttons
int stableBtn[NUM_BUTTONS] = {HIGH, HIGH, HIGH, HIGH};
int lastRawBtn[NUM_BUTTONS] = {HIGH, HIGH, HIGH, HIGH};
unsigned long lastBtnTime[NUM_BUTTONS] = {0, 0, 0, 0};

// Debounce state arrays for the 2 joystick click buttons (L3, R3)
const int JOY_SW_PINS[2] = {LEFT_JOY_SW, RIGHT_JOY_SW};
const uint8_t BLE_STICK_BTNS[2] = {BUTTON_5, BUTTON_6};
int stableSw[2] = {HIGH, HIGH};
int lastRawSw[2] = {HIGH, HIGH};
unsigned long lastSwTime[2] = {0, 0};

const unsigned long DEBOUNCE_MS = 20;

// Battery check timer (runs every 2 seconds)
const float LOW_BATTERY_V = 4.80;
unsigned long lastBattCheck = 0;

// ==============================================================================
// HELPER 1: AVERAGE 4 ADC READINGS & MAP TO BLE GAMEPAD RANGE (0 TO 32767)
// ==============================================================================
int16_t readAndMapAxis(int pin, int centerVal) {
  // Average 4 quick readings to smooth out analog jitter
  long sum = 0;
  for (int i = 0; i < 4; i++) {
    sum += analogRead(pin);
  }
  int raw = sum / 4;

  // Apply deadzone around the calibrated resting center (16384 = BLE center)
  int offset = raw - centerVal;
  if (abs(offset) < JOY_DEADZONE) {
    return 16384;
  }

  // Map negative side (0 to center-deadzone) -> (0 to 16384)
  if (offset < 0) {
    return constrain(map(raw, 0, centerVal - JOY_DEADZONE, 0, 16384), 0, 16384);
  }
  // Map positive side (center+deadzone to 4095) -> (16384 to 32767)
  else {
    return constrain(map(raw, centerVal + JOY_DEADZONE, 4095, 16384, 32767), 16384, 32767);
  }
}

// ==============================================================================
// HELPER 2: CHECK BATTERY VOLTAGE & UPDATE GREEN/RED LEDS + BLE BATTERY LEVEL
// ==============================================================================
void updateBatteryStatus() {
  long mvSum = 0;
  for (int i = 0; i < 8; i++) {
    mvSum += analogReadMilliVolts(BATTERY_SENSE_PIN);
  }
  // Multiply pin voltage by 2.0 (for the 10k + 10k divider)
  float battV = ((mvSum / 8.0) / 1000.0) * 2.0;

  if (battV > LOW_BATTERY_V) {
    digitalWrite(GREEN_POWER_LED, HIGH);
    digitalWrite(RED_LOW_BATT_LED, LOW);
  } else {
    digitalWrite(GREEN_POWER_LED, LOW);
    digitalWrite(RED_LOW_BATT_LED, HIGH);
  }

  // Convert voltage (4.5V empty to 6.0V full) to 0-100% and send to laptop
  int battPct = constrain((int)((battV - 4.5) * 100.0 / (6.0 - 4.5)), 0, 100);
  if (bleGamepad.isConnected()) {
    bleGamepad.setBatteryLevel(battPct);
  }
}

// ==============================================================================
// SETUP: RUNS ONCE ON BOOT
// ==============================================================================
void setup() {
  Serial.begin(115200);

  // Configure 12-bit ADC (0-4095) and 11dB range (0-3.3V) on all analog pins
  analogReadResolution(12);
  analogSetPinAttenuation(LEFT_JOY_VRX, ADC_11db);
  analogSetPinAttenuation(LEFT_JOY_VRY, ADC_11db);
  analogSetPinAttenuation(RIGHT_JOY_VRX, ADC_11db);
  analogSetPinAttenuation(RIGHT_JOY_VRY, ADC_11db);
  analogSetPinAttenuation(BATTERY_SENSE_PIN, ADC_11db);

  // Configure 4 Action Buttons and 4 Test LEDs
  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    pinMode(LED_PINS[i], OUTPUT);
    digitalWrite(LED_PINS[i], LOW);
    digitalWrite(LED_PINS[i], HIGH);
    delay(200);
    digitalWrite(LED_PINS[i], LOW);
  }

  // Configure 2 Joystick Click Buttons (SW)
  pinMode(LEFT_JOY_SW, INPUT_PULLUP);
  pinMode(RIGHT_JOY_SW, INPUT_PULLUP);

  // Configure Green & Red Battery Status LEDs
  pinMode(GREEN_POWER_LED, OUTPUT);
  pinMode(RED_LOW_BATT_LED, OUTPUT);

  // Calibrate joystick centers at boot (keep hands off sticks for 0.2s)
  long lx = 0, ly = 0, rx = 0, ry = 0;
  for (int i = 0; i < 16; i++) {
    lx += analogRead(LEFT_JOY_VRX);
    ly += analogRead(LEFT_JOY_VRY);
    rx += analogRead(RIGHT_JOY_VRX);
    ry += analogRead(RIGHT_JOY_VRY);
    delay(10);
  }
  leftCenterX  = lx / 16;
  leftCenterY  = ly / 16;
  rightCenterX = rx / 16;
  rightCenterY = ry / 16;

  updateBatteryStatus();

  // Start Bluetooth Gamepad advertising (autoReport = false so we send all updates together)
  BleGamepadConfiguration config;
  config.setAutoReport(false);
  bleGamepad.begin(&config);
}

// ==============================================================================
// LOOP: RUNS CONTINUOUSLY
// ==============================================================================
void loop() {
  // 1. Read & Debounce the 4 Color Buttons (always updates Test LEDs even if BLE isn't paired)
  for (int i = 0; i < NUM_BUTTONS; i++) {
    int raw = digitalRead(BUTTON_PINS[i]);
    if (raw != lastRawBtn[i]) lastBtnTime[i] = millis();

    if ((millis() - lastBtnTime[i]) > DEBOUNCE_MS) {
      if (raw != stableBtn[i]) {
        stableBtn[i] = raw;
        if (stableBtn[i] == LOW) {
          digitalWrite(LED_PINS[i], HIGH);        // Turn Test LED ON
          bleGamepad.press(BLE_BUTTONS[i]);       // Press BLE Button (1-4)
        } else {
          digitalWrite(LED_PINS[i], LOW);         // Turn Test LED OFF
          bleGamepad.release(BLE_BUTTONS[i]);     // Release BLE Button (1-4)
        }
      }
    }
    lastRawBtn[i] = raw;
  }

  // 2. Read & Debounce the 2 Joystick Thumb Clicks (L3 -> Button 5, R3 -> Button 6)
  for (int j = 0; j < 2; j++) {
    int rawSw = digitalRead(JOY_SW_PINS[j]);
    if (rawSw != lastRawSw[j]) lastSwTime[j] = millis();

    if ((millis() - lastSwTime[j]) > DEBOUNCE_MS) {
      if (rawSw != stableSw[j]) {
        stableSw[j] = rawSw;
        if (stableSw[j] == LOW) bleGamepad.press(BLE_STICK_BTNS[j]);
        else                    bleGamepad.release(BLE_STICK_BTNS[j]);
      }
    }
    lastRawSw[j] = rawSw;
  }

  // 3. Read Dual Joysticks & Transmit Everything Over Bluetooth
  if (bleGamepad.isConnected()) {
    int16_t lx = readAndMapAxis(LEFT_JOY_VRX, leftCenterX);
    int16_t ly = readAndMapAxis(LEFT_JOY_VRY, leftCenterY);
    int16_t rx = readAndMapAxis(RIGHT_JOY_VRX, rightCenterX);
    int16_t ry = readAndMapAxis(RIGHT_JOY_VRY, rightCenterY);

    // Update Left Stick (X, Y) and Right Stick (Z, RZ) and push packet to laptop
    bleGamepad.setAxes(lx, ly, rx, ry, 0, 0, 0, 0);
    bleGamepad.sendReport();
  }

  // 4. Check Battery Voltage Every 2 Seconds
  if ((millis() - lastBattCheck) >= 2000) {
    lastBattCheck = millis();
    updateBatteryStatus();
  }

  delay(10); // ~100Hz gamepad update rate
}