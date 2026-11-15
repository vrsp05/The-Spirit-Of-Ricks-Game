#include <Arduino.h>
#include <BleGamepad.h>

BleGamepad bleGamepad("ESP32 Retro Controller", "CustomBuild", 100);

// --- Game Action Buttons (Active LOW, Internal Pull-Up) ---
const int BTN_JUMP_YELLOW  = 27; // Jump
const int BTN_ACTION_RED   = 14; // Action / Interact
const int BTN_MENU_BLUE    = 12; // Menu & Map
const int BTN_BACK_WHITE   = 18; // Return / Back

// --- Button Indicator LEDs ---
const int LED_YELLOW = 16;
const int LED_RED    = 2;
const int LED_BLUE   = 4;
const int LED_WHITE  = 15;

// --- Power & Battery Status LEDs ---
const int LED_GREEN_PWR = 17;
const int LED_RED_BAT   = 5;
const int PIN_BAT_ADC   = 36; // VP (10k + 10k voltage divider)

// --- Left Joystick: Moving + Run Click (ADC1) ---
const int MOVE_X_PIN = 32;
const int MOVE_Y_PIN = 33;
const int RUN_SW_PIN = 25; // Left stick click (Run / Sprint)

// --- Right Joystick: Look Up/Down & All Axes (ADC1) ---
const int LOOK_X_PIN = 34;
const int LOOK_Y_PIN = 35;
const int LOOK_SW_PIN = 26; // Right stick click

// --- Deadzone Helper (Maps 0-4095 to 0-32767 with center deadzone) ---
int16_t mapAxis(int rawVal) {
  const int center = 2048;
  const int deadzone = 250;
  if (abs(rawVal - center) < deadzone) {
    return 16383; // Exact center for BleGamepad
  }
  return map(rawVal, 0, 4095, 0, 32767);
}

void setup() {
  Serial.begin(115200);

  // Configure Buttons
  pinMode(BTN_JUMP_YELLOW, INPUT_PULLUP);
  pinMode(BTN_ACTION_RED,  INPUT_PULLUP);
  pinMode(BTN_MENU_BLUE,   INPUT_PULLUP);
  pinMode(BTN_BACK_WHITE,  INPUT_PULLUP);
  pinMode(RUN_SW_PIN,      INPUT_PULLUP);
  pinMode(LOOK_SW_PIN,     INPUT_PULLUP);

  // Configure LEDs
  pinMode(LED_YELLOW,    OUTPUT);
  pinMode(LED_RED,       OUTPUT);
  pinMode(LED_BLUE,      OUTPUT);
  pinMode(LED_WHITE,     OUTPUT);
  pinMode(LED_GREEN_PWR, OUTPUT);
  pinMode(LED_RED_BAT,   OUTPUT);

  // Power LED ON by default
  digitalWrite(LED_GREEN_PWR, HIGH);
  digitalWrite(LED_RED_BAT,   LOW);

  // Start BLE Gamepad
  BleGamepadConfiguration config;
  config.setAutoReport(false);
  bleGamepad.begin(&config);
}

void loop() {
  // 1. Read Game Action Inputs (LOW = Pressed)
  bool jumpPressed   = (digitalRead(BTN_JUMP_YELLOW) == LOW);
  bool actionPressed = (digitalRead(BTN_ACTION_RED)  == LOW);
  bool menuPressed   = (digitalRead(BTN_MENU_BLUE)   == LOW);
  bool backPressed   = (digitalRead(BTN_BACK_WHITE)  == LOW);
  bool runPressed    = (digitalRead(RUN_SW_PIN)      == LOW);
  bool rStickPressed = (digitalRead(LOOK_SW_PIN)     == LOW);

  // 2. Light Up Matching LEDs When Pressed
  digitalWrite(LED_YELLOW, jumpPressed   ? HIGH : LOW);
  digitalWrite(LED_RED,    actionPressed ? HIGH : LOW);
  digitalWrite(LED_BLUE,   menuPressed   ? HIGH : LOW);
  digitalWrite(LED_WHITE,  backPressed   ? HIGH : LOW);

  // 3. Check Battery Voltage (10k + 10k divider -> Vbat = Vpin * 2)
  int rawBat = analogRead(PIN_BAT_ADC);
  float batteryVoltage = (rawBat / 4095.0) * 3.3 * 2.0;

  if (rawBat > 500 && batteryVoltage < 4.40) {
    digitalWrite(LED_RED_BAT,   HIGH);
    digitalWrite(LED_GREEN_PWR, LOW);
  } else {
    digitalWrite(LED_RED_BAT,   LOW);
    digitalWrite(LED_GREEN_PWR, HIGH);
  }

  // 4. Send BLE Gamepad Controls to the Game
  if (bleGamepad.isConnected()) {
    // Yellow = Jump (Button 1 / A)
    jumpPressed   ? bleGamepad.press(BUTTON_1) : bleGamepad.release(BUTTON_1);
    
    // White = Return / Back (Button 2 / B)
    backPressed   ? bleGamepad.press(BUTTON_2) : bleGamepad.release(BUTTON_2);
    
    // Red = Action (Button 3 / X)
    actionPressed ? bleGamepad.press(BUTTON_3) : bleGamepad.release(BUTTON_3);
    
    // Blue = Menu & Map (Button 4 / Y)
    menuPressed   ? bleGamepad.press(BUTTON_4) : bleGamepad.release(BUTTON_4);

    // Left Joystick Click = Run / Sprint (Triggers L3 Thumb + Button 5)
    if (runPressed) {
      bleGamepad.press(BUTTON_11);
      bleGamepad.press(BUTTON_5);
    } else {
      bleGamepad.release(BUTTON_11);
      bleGamepad.release(BUTTON_5);
    }

    // Right Joystick Click = R3 (Triggers R3 Thumb + Button 6)
    if (rStickPressed) {
      bleGamepad.press(BUTTON_12);
      bleGamepad.press(BUTTON_6);
    } else {
      bleGamepad.release(BUTTON_12);
      bleGamepad.release(BUTTON_6);
    }

    // Read & Map Left Stick (Move) and Right Stick (Look All Axes)
    int16_t moveX = mapAxis(analogRead(MOVE_X_PIN));
    int16_t moveY = mapAxis(analogRead(MOVE_Y_PIN));
    int16_t lookX = mapAxis(analogRead(LOOK_X_PIN));
    int16_t lookY = mapAxis(analogRead(LOOK_Y_PIN));

    // Send Move (Left X/Y) and Look (Right Z/RZ)
    bleGamepad.setAxes(moveX, moveY, lookX, lookY, 0, 0, 0, 0);
    bleGamepad.sendReport();
  }

  delay(15);
}