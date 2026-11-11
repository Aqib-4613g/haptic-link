// ============================================================
//  HAPTIC LINK - live connection settings  (EDIT THIS FILE)
// ============================================================
//  1. Create a free EMQX Cloud *Serverless* deployment (see the setup guide).
//  2. Paste the deployment Address and the WEBSITE username/password below.
//  3. deviceCode MUST be identical to DEVICE_CODE in the ESP32 sketch.
//
//  NOTE: this file ends up inside the public website, so anyone can read it.
//  Use a dedicated "website" credential here - never reuse a personal password.
export const LIVE = {
  host: 'YOUR-ADDRESS.emqxsl.com',             // the 'Address' shown on the EMQX deployment Overview page
  wsPort: 8084,                                // EMQX Serverless secure WebSocket (wss) port
  username: 'YOUR-WEBSITE-USERNAME',
  password: 'YOUR-WEBSITE-PASSWORD',
  deviceCode: 'hl-j8jqso688s',                 // secret-ish code that pairs site <-> wearable
};
