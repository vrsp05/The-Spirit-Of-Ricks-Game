// ==============================================================================
// PHASE 4: DUAL ANALOG JOYSTICKS (ADC1) + AUTO-CALIBRATION + DEADZONE
//          (Combined with Phase 2 Buttons/LEDs and Phase 3 Battery Monitor)
//
// Hardware Pin Map:
//   - Left Joystick:  VRx = GPIO 32 | VRy = GPIO 33 | SW (Click) = GPIO 25
//   - Right Joystick: VRx = GPIO 34 | VRy = GPIO 35 | SW (Click) = GPIO 26
//   - Action Buttons: Y = 27 (LED 16) | R = 14 (LED 2) | B = 12 (LED 4) | W = 13 (LED 15)
//   - Battery Sense:  SVP / GPIO 36 (Green LED = 17, Red LED = 5)
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. PHASE 4 PIN DEFINITIONS: LEFT & RIGHT JOYSTICKS (ADC1 PINS ONLY)
// ------------------------------------------------------------------------------
// CRITICAL: We use ADC1 pins (32, 33, 34, 35) because Bluetooth disables ADC2!
const int LEFT_JOY_VRX  = 32; // Left Joystick Horizontal (0 to 4095)
const int LEFT_JOY_VRY  = 33; // Left Joystick Vertical   (0 to 4095)
const int LEFT_JOY_SW   = 25; // Left Joystick Thumb Click (INPUT_PULLUP, Active LOW)

const int RIGHT_JOY_VRX = 34; // Right Joystick Horizontal (Input-only ADC1 pin)
const int RIGHT_JOY_VRY = 35; // Right Joystick Vertical   (Input-only ADC1 pin)
const int RIGHT_JOY_SW  = 26; // Right Joystick Thumb Click (INPUT_PULLUP, Active LOW)

// ------------------------------------------------------------------------------
// 2. JOYSTICK CALIBRATION & DEADZONE SETTINGS
// ------------------------------------------------------------------------------
// Instead of assuming the center is always 2048, we measure the true resting 
// center of each potentiometer during setup() while your hands are off the sticks.
int leftCenterX  = 2048;
int leftCenterY  = 2048;
int rightCenterX = 2048;
int rightCenterY = 2048;

// DEADZONE: Any movement within +/- 250 ADC counts of the resting center is 
// treated as 0. This prevents "stick drift" when the thumbsticks are untouched.
const int JOY_DEADZONE = 250;

// Timer to print readable joystick telemetry every 250ms (4 times per second)
unsigned long lastJoystickPrintTime = 0;
const unsigned long JOYSTICK_PRINT_INTERVAL_MS = 250;

// Debounce tracking for the 2 Joystick Thumb Click buttons (L3 = index 0, R3 = index 1)
const int JOY_SW_PINS[2]           = {LEFT_JOY_SW, RIGHT_JOY_SW};
const char* JOY_SW_NAMES[2]        = {"Left Stick Click (L3)", "Right Stick Click (R3)"};
int stableJoySwState[2]            = {HIGH, HIGH};
int lastRawJoySwReading[2]         = {HIGH, HIGH};
unsigned long lastJoySwDebounce[2] = {0, 0};

// ------------------------------------------------------------------------------
// 3. PHASE 2 & PHASE 3 PIN DEFINITIONS (BUTTONS, LEDS, BATTERY MONITOR)
// ------------------------------------------------------------------------------
const int NUM_BUTTONS = 4;
const int BUTTON_PINS[NUM_BUTTONS] = {27, 14, 12, 13}; // Y, R, B, W Buttons
const int LED_PINS[NUM_BUTTONS]    = {16, 2, 4, 15};   // Y, R, B, W LEDs
const char* COLOR_NAMES[NUM_BUTTONS] = {"Y (Yellow)", "R (Red)", "B (Blue)", "W (White)"};

int stableButtonState[NUM_BUTTONS]   = {HIGH, HIGH, HIGH, HIGH};
int lastRawReading[NUM_BUTTONS]      = {HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[NUM_BUTTONS] = {0, 0, 0, 0};
const unsigned long DEBOUNCE_DELAY_MS = 25;

const int BATTERY_SENSE_PIN = 36; // SVP / VP (ADC1_CH0)
const int GREEN_POWER_LED   = 17; // Good Power (> 4.8V)
const int RED_LOW_BATT_LED  = 5;  // Low Battery (<= 4.8V)
const float LOW_BATTERY_THRESHOLD_V = 4.80;
const float VOLTAGE_DIVIDER_RATIO   = 2.0;
unsigned long lastBatteryCheckTime  = 0;
const unsigned long BATTERY_CHECK_INTERVAL_MS = 2000; // Check every 2 seconds

// ==============================================================================
// HELPER FUNCTION 1: SMOOTH ANALOG READ (AVERAGES 8 SAMPLES TO REMOVE NOISE)
// ==============================================================================
int readSmoothAxis(int pin) {
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(pin);
  }
  return (int)(sum / 8);
}

// ==============================================================================
// HELPER FUNCTION 2: APPLY DEADZONE & MAP RAW ADC (0-4095) TO (-100 TO +100)
// ==============================================================================
int mapAxisWithDeadzone(int rawValue, int centerValue) {
  int offset = rawValue - centerValue;

  // If the stick is inside the deadzone window, return 0 (perfectly centered)
  if (abs(offset) < JOY_DEADZONE) {
    return 0;
  }

  // Map negative side (Left / Up) from [0 ... center - deadzone] to [-100 ... 0]
  if (offset < 0) {
    int mapped = map(rawValue, 0, centerValue - JOY_DEADZONE, -100, 0);
    return constrain(mapped, -100, 0);
  } 
  // Map positive side (Right / Down) from [center + deadzone ... 4095] to [0 ... +100]
  else {
    int mapped = map(rawValue, centerValue + JOY_DEADZONE, 4095, 0, 100);
    return constrain(mapped, 0, 100);
  }
}

// ==============================================================================
// HELPER FUNCTION 3: CALIBRATE RESTING CENTER POSITIONS AT STARTUP
// ==============================================================================
void calibrateJoysticks() {
  Serial.println("Calibrating Joysticks... DO NOT TOUCH STICKS!");
  long sumLX = 0, sumLY = 0, sumRX = 0, sumRY = 0;

  // Average 32 readings over ~160ms to find the true resting center of each axis
  for (int i = 0; i < 32; i++) {
    sumLX += analogRead(LEFT_JOY_VRX);
    sumLY += analogRead(LEFT_JOY_VRY);
    sumRX += analogRead(RIGHT_JOY_VRX);
    sumRY += analogRead(RIGHT_JOY_VRY);
    delay(5);
  }

  leftCenterX  = sumLX / 32;
  leftCenterY  = sumLY / 32;
  rightCenterX = sumRX / 32;
  rightCenterY = sumRY / 32;

  Serial.print("  -> Left Center  (X, Y): ");
  Serial.print(leftCenterX);
  Serial.print(", ");
  Serial.println(leftCenterY);

  Serial.print("  -> Right Center (X, Y): ");
  Serial.print(rightCenterX);
  Serial.print(", ");
  Serial.println(rightCenterY);
}

// ==============================================================================
// HELPER FUNCTION 4: CHECK BATTERY VOLTAGE & UPDATE GREEN/RED LEDS
// ==============================================================================
void checkBatteryStatus() {
  long millivoltsSum = 0;
  for (int i = 0; i < 16; i++) {
    millivoltsSum += analogReadMilliVolts(BATTERY_SENSE_PIN);
  }
  float pinVoltage = (millivoltsSum / 16.0) / 1000.0;
  float batteryVoltage = pinVoltage * VOLTAGE_DIVIDER_RATIO;

  if (batteryVoltage > LOW_BATTERY_THRESHOLD_V) {
    digitalWrite(GREEN_POWER_LED, HIGH);
    digitalWrite(RED_LOW_BATT_LED, LOW);
  } else {
    digitalWrite(GREEN_POWER_LED, LOW);
    digitalWrite(RED_LOW_BATT_LED, HIGH);
  }
}

// ==============================================================================
// SETUP: RUNS ONCE ON BOOT
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("==========================================================");
  Serial.println("Phase 4: Dual Analog Joysticks + Buttons + Battery Monitor");
  Serial.println("==========================================================");

  // 1. Configure ADC resolution (12-bit: 0 to 4095) and 11dB range (0 to 3.3V)
  analogReadResolution(12);
  analogSetPinAttenuation(LEFT_JOY_VRX,  ADC_11db);
  analogSetPinAttenuation(LEFT_JOY_VRY,  ADC_11db);
  analogSetPinAttenuation(RIGHT_JOY_VRX, ADC_11db);
  analogSetPinAttenuation(RIGHT_JOY_VRY, ADC_11db);
  analogSetPinAttenuation(BATTERY_SENSE_PIN, ADC_11db);

  // 2. Configure Joystick Thumb-Click buttons (SW) with internal pull-up resistors
  pinMode(LEFT_JOY_SW,  INPUT_PULLUP);
  pinMode(RIGHT_JOY_SW, INPUT_PULLUP);

  // 3. Configure Phase 2 Action Buttons & Test LEDs
  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    pinMode(LED_PINS[i], OUTPUT);
    digitalWrite(LED_PINS[i], LOW);
  }

  // 4. Configure Phase 3 Battery Status LEDs
  pinMode(GREEN_POWER_LED, OUTPUT);
  pinMode(RED_LOW_BATT_LED, OUTPUT);

  // 5. Auto-calibrate joystick resting centers and check initial battery status
  calibrateJoysticks();
  checkBatteryStatus();
}

// ==============================================================================
// LOOP: RUNS CONTINUOUSLY
// ==============================================================================
void loop() {
  // ----------------------------------------------------------------------------
  // TASK 1: Poll 4 Color Action Buttons (Y, R, B, W)
  // ----------------------------------------------------------------------------
  for (int i = 0; i < NUM_BUTTONS; i++) {
    int raw = digitalRead(BUTTON_PINS[i]);
    if (raw != lastRawReading[i]) {
      lastDebounceTime[i] = millis();
    }
    if ((millis() - lastDebounceTime[i]) > DEBOUNCE_DELAY_MS) {
      if (raw != stableButtonState[i]) {
        stableButtonState[i] = raw;
        if (stableButtonState[i] == LOW) {
          digitalWrite(LED_PINS[i], HIGH);
          Serial.print("[BUTTON PRESSED]  ");
          Serial.println(COLOR_NAMES[i]);
        } else {
          digitalWrite(LED_PINS[i], LOW);
          Serial.print("[BUTTON RELEASED] ");
          Serial.println(COLOR_NAMES[i]);
        }
      }
    }
    lastRawReading[i] = raw;
  }

  // ----------------------------------------------------------------------------
  // TASK 2: Poll 2 Joystick Thumb-Click Buttons (SW on GPIO 25 & GPIO 26)
  // ----------------------------------------------------------------------------
  for (int j = 0; j < 2; j++) {
    int rawSw = digitalRead(JOY_SW_PINS[j]);
    if (rawSw != lastRawJoySwReading[j]) {
      lastJoySwDebounce[j] = millis();
    }
    if ((millis() - lastJoySwDebounce[j]) > DEBOUNCE_DELAY_MS) {
      if (rawSw != stableJoySwState[j]) {
        stableJoySwState[j] = rawSw;
        if (stableJoySwState[j] == LOW) {
          Serial.print("[STICK CLICKED]   ");
          Serial.println(JOY_SW_NAMES[j]);
        } else {
          Serial.print("[STICK RELEASED]  ");
          Serial.println(JOY_SW_NAMES[j]);
        }
      }
    }
    lastRawJoySwReading[j] = rawSw;
  }

  // ----------------------------------------------------------------------------
  // TASK 3: Read & Print Dual Analog Joystick Axes Every 250ms
  // ----------------------------------------------------------------------------
  if ((millis() - lastJoystickPrintTime) >= JOYSTICK_PRINT_INTERVAL_MS) {
    lastJoystickPrintTime = millis();

    // Read smoothed 12-bit ADC values (0 to 4095)
    int rawLX = readSmoothAxis(LEFT_JOY_VRX);
    int rawLY = readSmoothAxis(LEFT_JOY_VRY);
    int rawRX = readSmoothAxis(RIGHT_JOY_VRX);
    int rawRY = readSmoothAxis(RIGHT_JOY_VRY);

    // Convert to clean game percentages (-100% to +100%) with deadzone applied
    int mapLX = mapAxisWithDeadzone(rawLX, leftCenterX);
    int mapLY = mapAxisWithDeadzone(rawLY, leftCenterY);
    int mapRX = mapAxisWithDeadzone(rawRX, rightCenterX);
    int mapRY = mapAxisWithDeadzone(rawRY, rightCenterY);

    // Print Left & Right Joystick telemetry on a single clean line
    Serial.print("LEFT [Raw: ");
    Serial.print(rawLX); Serial.print(","); Serial.print(rawLY);
    Serial.print(" | Map: ");
    Serial.print(mapLX); Serial.print("%,"); Serial.print(mapLY);
    Serial.print("%]   ||   RIGHT [Raw: ");
    Serial.print(rawRX); Serial.print(","); Serial.print(rawRY);
    Serial.print(" | Map: ");
    Serial.print(mapRX); Serial.print("%,"); Serial.print(mapRY);
    Serial.println("%]");
  }

  // ----------------------------------------------------------------------------
  // TASK 4: Background Battery Check (Every 2 Seconds)
  // ----------------------------------------------------------------------------
  if ((millis() - lastBatteryCheckTime) >= BATTERY_CHECK_INTERVAL_MS) {
    lastBatteryCheckTime = millis();
    checkBatteryStatus();
  }
}