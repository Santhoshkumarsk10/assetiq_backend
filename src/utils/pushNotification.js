const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

let fcmMessaging = null;
let liveConnection = false;

try {
  const cleanEnvValue = (val) => {
    if (!val) return val;
    return val.replace(/^["']|["']$/g, '').trim();
  };

  let privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.trim() : null;
  if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    const serviceAccount = {
      type: cleanEnvValue(process.env.FIREBASE_TYPE) || 'service_account',
      project_id: cleanEnvValue(process.env.FIREBASE_PROJECT_ID),
      private_key_id: cleanEnvValue(process.env.FIREBASE_PRIVATE_KEY_ID),
      private_key: privateKey,
      client_email: cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL),
      client_id: cleanEnvValue(process.env.FIREBASE_CLIENT_ID),
      auth_uri: cleanEnvValue(process.env.FIREBASE_AUTH_URI),
      token_uri: cleanEnvValue(process.env.FIREBASE_TOKEN_URI),
      auth_provider_x509_cert_url: cleanEnvValue(process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL),
      client_x509_cert_url: cleanEnvValue(process.env.FIREBASE_CLIENT_X509_CERT_URL),
      universe_domain: cleanEnvValue(process.env.FIREBASE_UNIVERSE_DOMAIN)
    };

    initializeApp({
      credential: cert(serviceAccount)
    });
    fcmMessaging = getMessaging();
    liveConnection = true;
    console.log('[FIREBASE] Admin SDK Initialized Successfully ✅');
  } else {
    console.log('[FIREBASE] Credentials not found. FCM running in Sandbox mode ℹ️');
  }
} catch (error) {
  console.error('[FIREBASE] Failed to initialize Firebase Admin SDK:', error.message);
}

/**
 * Sends a push notification to a single FCM token.
 */
async function sendPushNotification(fcmToken, title, message) {
  if (!fcmToken) return;

  console.log(`[Push Notification] Dispatching to token: ${fcmToken.substring(0, 15)}...`);
  console.log(`Payload -> Title: "${title}", Body: "${message}"`);

  if (liveConnection && fcmMessaging) {
    try {
      const payload = {
        token: fcmToken,
        notification: {
          title,
          body: message
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            priority: 'max',
            channelId: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              sound: 'default'
            }
          }
        }
      };

      const response = await fcmMessaging.send(payload);
      console.log(`[FCM Live Response] Success:`, response);
      return response;
    } catch (err) {
      console.error('[FCM Live Error] Failed to send push:', err.message);
      // If token is invalid, clean it up from the database dynamically
      if (
        err.code === 'messaging/invalid-registration-token' ||
        err.code === 'messaging/registration-token-not-registered'
      ) {
        console.log(`[FCM Cleanup] Stale token detected. Purging from user DB...`);
        const { User } = require('../models');
        if (User) {
          await User.update({ fcm_token: null }, { where: { fcm_token: fcmToken } });
        }
      }
      throw err;
    }
  } else {
    console.log('[Push Notification Sandbox Logger] Dispatched successfully! (Live connection disabled)');
  }
}

module.exports = { sendPushNotification };
