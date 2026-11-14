// ==============================================================================
// STEP 1: ESP32 WROOM BASIC "HEARTBEAT" LED TEST
// Goal: Verify the ESP32 is receiving power, can be flashed, and runs loops.
// ==============================================================================

// We define the pin connected to our test LED.
// Pin 2 is usually connected to the tiny blue built-in LED on most ESP32 WROOM boards.
// If you want to use an external LED from your kit, you can keep it as Pin 2, 
// or change it to another safe output pin like 15 or 4.
const int TEST_LED_PIN = 2; 

void setup() {
  // The setup() function runs exactly once when you press reset or power the board.
  
  // Initialize the serial monitor at a baud rate of 115200.
  // This is crucial for ESP32 debugging later on when we test Bluetooth and joysticks.
  Serial.begin(115200);
  
  // Configure the specified LED pin to behave as an OUTPUT.
  // This tells the ESP32 microcontroller that we intend to send voltage OUT of this pin,
  // rather than reading voltage IN (which we will use later for the buttons).
  pinMode(TEST_LED_PIN, OUTPUT);
  
  // Print a startup message to the Serial Monitor to confirm the code actually booted.
  Serial.println("ESP32 Test 1: LED Blink Started...");
}

void loop() {
  // The loop() function runs over and over again continuously.
  
  // digitalWrite() sets the voltage of the pin.
  // HIGH sends 3.3 Volts to the pin, completing the circuit and turning the LED ON.
  digitalWrite(TEST_LED_PIN, HIGH);
  
  // Print status to the Serial Monitor so you can verify the software matches the hardware.
  Serial.println("LED is ON");
  
  // delay() pauses the microcontroller's execution.
  // The parameter is in milliseconds. 1000 milliseconds = 1 full second.
  delay(1000);
  
  // LOW drops the voltage at the pin down to 0 Volts (Ground), turning the LED OFF.
  digitalWrite(TEST_LED_PIN, LOW);
  
  // Print status to the Serial Monitor.
  Serial.println("LED is OFF");
  
  // Pause for another 1 full second while the LED remains off before starting the loop again.
  delay(1000);
}