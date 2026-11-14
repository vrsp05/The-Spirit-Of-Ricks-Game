// ==============================================================================
// PHASE 2: 4 COLOR-CODED ACTION BUTTONS & 4 TEST LEDS WITH DEBOUNCING
// Mapping:
//   - Yellow (Y): Button = GPIO 27 | LED = GPIO 16
//   - Red    (R): Button = GPIO 14 | LED = GPIO 2
//   - Blue   (B): Button = GPIO 12 | LED = GPIO 4
//   - White  (W): Button = GPIO 13 | LED = GPIO 15
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. PIN DEFINITIONS
// ------------------------------------------------------------------------------
// Total number of button/LED pairs we are testing
const int NUM_BUTTONS = 4;

// Array of Button GPIO pins in order: Yellow (27), Red (14), Blue (12), White (13)
const int BUTTON_PINS[NUM_BUTTONS] = {27, 14, 12, 13};

// Array of matching LED GPIO pins in the exact same order:
// Yellow LED (16), Red LED (2), Blue LED (4), White LED (15)
const int LED_PINS[NUM_BUTTONS]    = {16, 2, 4, 15};

// Human-readable color labels for the Serial Monitor output
const char* COLOR_NAMES[NUM_BUTTONS] = {
  "Y (Yellow)", 
  "R (Red)", 
  "B (Blue)", 
  "W (White)"
};

// ------------------------------------------------------------------------------
// 2. DEBOUNCING & STATE TRACKING VARIABLES
// ------------------------------------------------------------------------------
// Physical buttons bounce when pressed. Since we use INPUT_PULLUP:
//   - HIGH (1) = Button is RELEASED (pulled up internally to 3.3V)
//   - LOW  (0) = Button is PRESSED  (connected directly to GND)

int stableButtonState[NUM_BUTTONS]   = {HIGH, HIGH, HIGH, HIGH}; // Confirmed state
int lastRawReading[NUM_BUTTONS]      = {HIGH, HIGH, HIGH, HIGH}; // Previous loop reading
unsigned long lastDebounceTime[NUM_BUTTONS] = {0, 0, 0, 0};      // Last bounce timestamp

// 25ms eliminates mechanical switch bounce without adding noticeable game lag
const unsigned long DEBOUNCE_DELAY_MS = 25;

// ==============================================================================
// SETUP: RUNS ONCE WHEN BOARD BOOTS OR RESETS
// ==============================================================================
void setup() {
  // Initialize Serial Monitor at 115200 baud
  Serial.begin(115200);
  delay(500); // Short pause so the Serial Monitor catches the startup banner

  Serial.println("==========================================================");
  Serial.println("Phase 2: Y / R / B / W Buttons & LEDs Test Initialized");
  Serial.println("  Y: Btn 27 -> LED 16 | R: Btn 14 -> LED 2");
  Serial.println("  B: Btn 12 -> LED 4  | W: Btn 13 -> LED 15");
  Serial.println("==========================================================");

  // Loop through all 4 channels (indices 0, 1, 2, 3) to set up pins
  for (int i = 0; i < NUM_BUTTONS; i++) {
    
    // Enable the ESP32's internal pull-up resistor on each button pin.
    // The pin stays HIGH (3.3V) until the button connects it to GND (LOW).
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);

    // Configure each corresponding LED pin as a digital OUTPUT
    pinMode(LED_PINS[i], OUTPUT);

    // Ensure all 4 LEDs start turned OFF (0V)
    digitalWrite(LED_PINS[i], LOW);
  }
}

// ==============================================================================
// LOOP: RUNS CONTINUOUSLY
// ==============================================================================
void loop() {
  // Iterate through all 4 color channels (0 = Y, 1 = R, 2 = B, 3 = W)
  for (int i = 0; i < NUM_BUTTONS; i++) {
    
    // Step A: Read the current instant voltage on the button pin (HIGH or LOW)
    int currentRawReading = digitalRead(BUTTON_PINS[i]);

    // Step B: If the pin state changed since the last loop iteration (from a press,
    // release, or mechanical bounce), reset the debounce timer for this button.
    if (currentRawReading != lastRawReading[i]) {
      lastDebounceTime[i] = millis();
    }

    // Step C: Check if the signal has remained stable for longer than 25ms
    if ((millis() - lastDebounceTime[i]) > DEBOUNCE_DELAY_MS) {
      
      // If the stable reading differs from the last confirmed state, a valid press
      // or release event occurred.
      if (currentRawReading != stableButtonState[i]) {
        stableButtonState[i] = currentRawReading;

        // Active LOW check: LOW means the button is currently pressed down
        if (stableButtonState[i] == LOW) {
          // Turn ON the matching color LED
          digitalWrite(LED_PINS[i], HIGH);
          
          // Log the press event with pin numbers to the Serial Monitor
          Serial.print("[PRESSED]  ");
          Serial.print(COLOR_NAMES[i]);
          Serial.print(" Button (GPIO ");
          Serial.print(BUTTON_PINS[i]);
          Serial.print(") -> LED (GPIO ");
          Serial.print(LED_PINS[i]);
          Serial.println(") ON");
        } 
        else {
          // Turn OFF the matching color LED when the button is released
          digitalWrite(LED_PINS[i], LOW);
          
          // Log the release event to the Serial Monitor
          Serial.print("[RELEASED] ");
          Serial.print(COLOR_NAMES[i]);
          Serial.print(" Button (GPIO ");
          Serial.print(BUTTON_PINS[i]);
          Serial.print(") -> LED (GPIO ");
          Serial.print(LED_PINS[i]);
          Serial.println(") OFF");
        }
      }
    }

    // Step D: Store the current raw reading for comparison in the next loop
    lastRawReading[i] = currentRawReading;
  }
}