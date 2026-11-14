// ==============================================================================
// PHASE 3: BATTERY POWER MONITOR (GREEN & RED STATUS LEDS) + PHASE 2 BUTTONS
// Hardware Setup:
//   - Battery Voltage Sense: GPIO 36 (SVP / VP / ADC1_CH0) via 10k/10k divider
//   - Green Power LED (Good Battery > 4.8V): GPIO 17
//   - Red Status LED  (Low Battery <= 4.8V): GPIO 5
//   - Kept from Phase 2: Y(27->16), R(14->2), B(12->4), W(13->15)
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. PHASE 3 PIN DEFINITIONS (POWER MONITOR & STATUS LEDS)
// ------------------------------------------------------------------------------
// GPIO 36 is labeled "VP" or "SVP" (next to EN). It uses ADC1, so it is 100% 
// safe to use alongside Bluetooth later in Phase 5!
const int BATTERY_SENSE_PIN = 36; 

// Green LED turns ON when battery pack is healthy (> 4.8V)
const int GREEN_POWER_LED   = 17; 

// Red LED turns ON when battery pack is getting low (<= 4.8V)
const int RED_LOW_BATT_LED  = 5;  

// ------------------------------------------------------------------------------
// 2. BATTERY VOLTAGE THRESHOLDS & CALIBRATION CONSTANTS
// ------------------------------------------------------------------------------
// A fresh 4xAA pack is ~6.0V to 6.4V. 
// When 4 alkaline AAs drop to 1.2V per cell (4.8V total), they are getting low
// and close to the minimum dropout voltage needed by the ESP32's 5V/VIN regulator.
const float LOW_BATTERY_THRESHOLD_V = 4.80;

// Because we use two equal 10k ohm resistors, the voltage at GPIO 36 is cut in half.
// Multiply the pin voltage by 2.0 to reconstruct the actual battery pack voltage.
const float VOLTAGE_DIVIDER_RATIO   = 2.0;

// Timer so we only check and print battery voltage once every 1000ms (1 second)
// without slowing down the fast button responsiveness.
unsigned long lastBatteryCheckTime  = 0;
const unsigned long BATTERY_CHECK_INTERVAL_MS = 1000;

// ------------------------------------------------------------------------------
// 3. PHASE 2 PIN DEFINITIONS (Y, R, B, W BUTTONS & TEST LEDS)
// ------------------------------------------------------------------------------
const int NUM_BUTTONS = 4;
const int BUTTON_PINS[NUM_BUTTONS] = {27, 14, 12, 13}; // Y, R, B, W Buttons
const int LED_PINS[NUM_BUTTONS]    = {16, 2, 4, 15};   // Y, R, B, W LEDs
const char* COLOR_NAMES[NUM_BUTTONS] = {"Y (Yellow)", "R (Red)", "B (Blue)", "W (White)"};

int stableButtonState[NUM_BUTTONS]   = {HIGH, HIGH, HIGH, HIGH};
int lastRawReading[NUM_BUTTONS]      = {HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[NUM_BUTTONS] = {0, 0, 0, 0};
const unsigned long DEBOUNCE_DELAY_MS = 25;

// ==============================================================================
// HELPER FUNCTION: READ & CALCULATE BATTERY PACK VOLTAGE
// ==============================================================================
void checkBatteryStatus() {
  // We take 16 quick readings and average them to smooth out any electrical noise
  long rawAdcSum = 0;
  long millivoltsSum = 0;

  for (int i = 0; i < 16; i++) {
    rawAdcSum     += analogRead(BATTERY_SENSE_PIN);
    // analogReadMilliVolts() uses the ESP32's factory eFuse calibration for much 
    // more accurate voltage readings than raw 0-4095 math alone!
    millivoltsSum += analogReadMilliVolts(BATTERY_SENSE_PIN);
  }

  int avgRawAdc = rawAdcSum / 16;
  float pinVoltage = (millivoltsSum / 16.0) / 1000.0; // Convert mV to Volts at GPIO 36

  // Multiply by 2.0 (our 10k + 10k divider ratio) to get real battery pack voltage
  float batteryVoltage = pinVoltage * VOLTAGE_DIVIDER_RATIO;

  // Compare battery voltage against our 4.8V low-battery threshold
  if (batteryVoltage > LOW_BATTERY_THRESHOLD_V) {
    // GOOD POWER: Turn Green LED ON, Red LED OFF
    digitalWrite(GREEN_POWER_LED, HIGH);
    digitalWrite(RED_LOW_BATT_LED, LOW);

    Serial.print("[BATTERY OK]  Pack: ");
    Serial.print(batteryVoltage, 2);
    Serial.print(" V (SVP Pin 36: ");
    Serial.print(pinVoltage, 2);
    Serial.print(" V | Raw ADC: ");
    Serial.print(avgRawAdc);
    Serial.println(") -> GREEN LED ON");
  } 
  else {
    // LOW POWER WARNING: Turn Green LED OFF, Red LED ON
    digitalWrite(GREEN_POWER_LED, LOW);
    digitalWrite(RED_LOW_BATT_LED, HIGH);

    Serial.print("[LOW BATTERY] Pack: ");
    Serial.print(batteryVoltage, 2);
    Serial.print(" V (SVP Pin 36: ");
    Serial.print(pinVoltage, 2);
    Serial.print(" V | Raw ADC: ");
    Serial.print(avgRawAdc);
    Serial.println(") -> RED WARNING LED ON!");
  }
}

// ==============================================================================
// SETUP: RUNS ONCE ON BOOT
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("==========================================================");
  Serial.println("Phase 3: Battery Monitor (SVP/36) + Green(17) & Red(5) LEDs");
  Serial.println("==========================================================");

  // Configure Phase 3 Power Indicator LEDs as OUTPUTs
  pinMode(GREEN_POWER_LED, OUTPUT);
  pinMode(RED_LOW_BATT_LED, OUTPUT);
  digitalWrite(GREEN_POWER_LED, LOW);
  digitalWrite(RED_LOW_BATT_LED, LOW);

  // Configure the ESP32 ADC resolution to 12-bit (0 to 4095)
  analogReadResolution(12);
  // Set 11dB attenuation on GPIO 36 so it can accurately read up to ~3.1V - 3.3V
  analogSetPinAttenuation(BATTERY_SENSE_PIN, ADC_11db);

  // Configure Phase 2 Action Buttons & Test LEDs
  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    pinMode(LED_PINS[i], OUTPUT);
    digitalWrite(LED_PINS[i], LOW);
  }

  // Run an immediate battery check right at startup so the status LED lights up immediately
  checkBatteryStatus();
}

// ==============================================================================
// LOOP: RUNS CONTINUOUSLY
// ==============================================================================
void loop() {
  // ----------------------------------------------------------------------------
  // TASK 1: Fast Button Polling (Runs every loop with zero delay)
  // ----------------------------------------------------------------------------
  for (int i = 0; i < NUM_BUTTONS; i++) {
    int currentRawReading = digitalRead(BUTTON_PINS[i]);

    if (currentRawReading != lastRawReading[i]) {
      lastDebounceTime[i] = millis();
    }

    if ((millis() - lastDebounceTime[i]) > DEBOUNCE_DELAY_MS) {
      if (currentRawReading != stableButtonState[i]) {
        stableButtonState[i] = currentRawReading;

        if (stableButtonState[i] == LOW) {
          digitalWrite(LED_PINS[i], HIGH);
          Serial.print("[PRESSED]  ");
          Serial.println(COLOR_NAMES[i]);
        } else {
          digitalWrite(LED_PINS[i], LOW);
          Serial.print("[RELEASED] ");
          Serial.println(COLOR_NAMES[i]);
        }
      }
    }
    lastRawReading[i] = currentRawReading;
  }

  // ----------------------------------------------------------------------------
  // TASK 2: Periodic Battery Voltage Check (Runs once every 1 second)
  // ----------------------------------------------------------------------------
  if ((millis() - lastBatteryCheckTime) >= BATTERY_CHECK_INTERVAL_MS) {
    lastBatteryCheckTime = millis();
    checkBatteryStatus();
  }
}