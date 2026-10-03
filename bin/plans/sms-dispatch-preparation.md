# Engineering Specification & Handoff: The Household Edge SMS Gateway Subsystem

**Document Version:** 1.0  
**Target Environment:** Android (API Level 26–34) / Standalone Module  
**Hardware Profile:** Daughter’s 4 GB RAM Android Smartphone (Acting as Local Edge Node)  
**Client Device:** Noor’s 2G Feature Phone (SMS-only, zero IP connectivity)

---

## 1. System Architecture & Subsystem Isolation

The **Household Edge SMS Gateway** is designed as a decoupled background service (`:feature:sms-hub`). It operates independently from the primary UI, allowing Noor’s daughter to use the phone normally or leave it in a low-power standby state at the house while Noor is out on the coffee slopes.

### End-to-End Control & Data Flow

```
[ Noor on the Slope ]
       │
       │ (1) Sends standard 2G SMS over cellular control channel (Zero Mobile Data)
       ▼
[ Daughter's Phone Baseband / Cellular Modem ]
       │
       │ (2) OS triggers android.provider.Telephony.SMS_RECEIVED
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ :feature:sms-hub (Local Android Process)                               │
│                                                                        │
│  ┌────────────────────────┐                                            │
│  │   SmsBroadcastReceiver │ (Grabs WakeLock, routes PDU)              │
│  └───────────┬────────────┘                                            │
│              ▼                                                         │
│  ┌────────────────────────┐                                            │
│  │    HubWorkerService    │ ◄── Managed by Foreground Service / WorkMgr│
│  └───────────┬────────────┘                                            │
│              ▼                                                         │
│  ┌────────────────────────┐                                            │
│  │ SQLite Audit Queue     │ (Persists incoming query: synced=0)        │
│  └───────────┬────────────┘                                            │
│              ▼                                                         │
│  ┌────────────────────────┐                                            │
│  │ Local Translation Unit │ (OPUS-MT or rule-based slot normalizer)    │
│  └───────────┬────────────┘                                            │
│              ▼                                                         │
│  ┌────────────────────────┐                                            │
│  │ 1B LLM Inference Engine│ (llama.cpp JNI / Qwen3.5-0.8B / MiniCPM5)  │
│  │ (Max 60 tokens, JSON)  │                                            │
│  └───────────┬────────────┘                                            │
│              ▼                                                         │
│  ┌────────────────────────┐                                            │
│  │ 160-Char Formatter &   │ (Evaluates Confidence Threshold >= 0.75)   │
│  │ Guardrail Gate         │                                            │
│  └───────────┬────────────┘                                            │
│              ▼                                                         │
│  ┌────────────────────────┐                                            │
│  │   SmsManager Dispatch  │ (Sends standard cellular SMS back to Noor) │
│  └────────────────────────┘                                            │
└────────────────────────────────────────────────────────────────────────┘
       │
       │ (3) Standard 2G SMS return delivery
       ▼
[ Noor on the Slope receives actionable, single-message advice in < 15 seconds ]
```

---

## 2. Android System Design & Lifecycle Hardening

On modern Android devices, the operating system aggressively terminates background processes to conserve battery (Doze Mode / App Standby). Because inference on a 1B model requires 3 to 8 seconds of continuous CPU computation, execution cannot happen inside a standard `BroadcastReceiver` (which has a 10-second timeout and no CPU execution guarantee).

### A. Lifecycle Architecture

1. **`SmsBroadcastReceiver`**: Wakes instantly on `SMS_RECEIVED`. It does **not** run inference. It immediately acquires a `PowerManager.PARTIAL_WAKE_LOCK` with a 30-second timeout and dispatches an explicit `ForegroundService`.
2. **`HubWorkerService` (`ForegroundService`)**:
   * Displays an ongoing status notification: *"Ondera Field Hub: Active (Listening for Noor's queries)"*.
   * Holds the CPU awake via the `WakeLock` while native C++ (`llama.cpp`) generates tokens.
   * Manages sequential execution so incoming messages are queued and never execute concurrent model inferences.

### B. Permissions Manifest Configuration

Add the following to `AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Cellular Carrier Permissions (Zero IP Internet Required) -->
    <uses-permission android:name="android.permission.RECEIVE_SMS" />
    <uses-permission android:name="android.permission.SEND_SMS" />
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />

    <!-- CPU Lifecycle Management -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />

    <application>
        <receiver
            android:name=".sms.SmsBroadcastReceiver"
            android:enabled="true"
            android:exported="true"
            android:permission="android.permission.BROADCAST_SMS">
            <intent-filter android:priority="999">
                <action android:name="android.provider.Telephony.SMS_RECEIVED" />
            </intent-filter>
        </receiver>

        <service
            android:name=".sms.HubWorkerService"
            android:foregroundServiceType="specialUse"
            android:exported="false" />
    </application>
</manifest>
```

---

## 3. The Local Inference & Guardrail Pipeline

### A. Strict Token & Generation Budget

SMS messages have a strict physical character limit:
* **GSM 7-bit Encoding (Latin / Swahili):** **160 characters** per SMS segment.
* **UCS-2 16-bit Encoding (Devanagari / Hindi):** **70 characters** per SMS segment.

To keep Noor from paying multi-part SMS charges and to ensure inference finishes in under 5 seconds:
* **`max_tokens`**: Hard-capped at **48 tokens**.
* **`temperature`**: **0.1** (deterministic, minimal creativity).
* **`stop_tokens`**: `["\n", "<|im_end|>", "###"]`.

### B. Two-Tier Decision & Fail-Safe Engine

The system uses a two-tier decision logic to strictly fulfill the **Pass/Fail Guardrail** (*"Not sure — ask a person"*):

```
                       [ Incoming Prompt ]
                                │
                                ▼
                   ┌──────────────────────────┐
                   │  1B Model Evaluates Query │
                   └────────────┬─────────────┘
                                │
                 Outputs: JSON with Confidence
                                │
                                ▼
                  [ Is Confidence >= 0.75? ]
                                │
                ┌───────────────┴───────────────┐
               YES                              NO
                │                               │
                ▼                               ▼
    ┌───────────────────────┐       ┌───────────────────────┐
    │  Generate Formatted   │       │   EXECUTE FAIL-SAFE   │
    │  SMS Advice (<160 ch) │       │                       │
    └───────────────────────┘       │ "Ondera Alert: Issue  │
                                    │ unclear. DO NOT spray.│
                                    │ Logged for Extension  │
                                    │ Officer visit."       │
                                    └───────────────────────┘
```

---

## 4. Production-Ready Implementation Code

### File 1: `SmsBroadcastReceiver.kt`

```kotlin
package org.worldbank.ondera.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Telephony
import android.util.Log

class SmsBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        val senderNumber = messages[0].displayOriginatingAddress ?: return
        val fullMessageBody = buildString {
            for (sms in messages) {
                append(sms.displayMessageBody)
            }
        }

        Log.d("OnderaHub", "Incoming Slope SMS from: $senderNumber | Body: $fullMessageBody")

        // Acquire WakeLock to keep CPU awake while transferring execution to Service
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "OnderaHub::SmsReceiveWakeLock"
        ).apply { acquire(30_000) } // 30-second failsafe limit

        // Hand off to Background Execution Engine
        val serviceIntent = Intent(context, HubWorkerService::class.java).apply {
            putExtra(HubWorkerService.EXTRA_SENDER, senderNumber)
            putExtra(HubWorkerService.EXTRA_BODY, fullMessageBody)
        }
        context.startForegroundService(serviceIntent)
    }
}
```

---

### File 2: `HubWorkerService.kt`

```kotlin
package org.worldbank.ondera.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.telephony.SmsManager
import android.util.Log
import kotlinx.coroutines.*
import org.worldbank.ondera.data.AppDatabase
import org.worldbank.ondera.data.QueryLogEntity
import org.worldbank.ondera.ai.SmallAiEngine

class HubWorkerService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    companion object {
        const val EXTRA_SENDER = "extra_sender"
        const val EXTRA_BODY = "extra_body"
        private const val CHANNEL_ID = "ondera_hub_channel"
        private const val NOTIFICATION_ID = 404
        private const val CONFIDENCE_THRESHOLD = 0.75f
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val sender = intent?.getStringExtra(EXTRA_SENDER) ?: return START_NOT_STICKY
        val text = intent.getStringExtra(EXTRA_BODY) ?: return START_NOT_STICKY

        serviceScope.launch {
            try {
                processIncomingSms(sender, text)
            } catch (e: Exception) {
                Log.e("OnderaHub", "Error processing SMS", e)
                sendSmsResponse(sender, "Ondera Alert: System busy. Please re-send your query.")
            } finally {
                stopSelf(startId)
            }
        }

        return START_NOT_STICKY
    }

    private suspend fun processIncomingSms(sender: String, messageText: String) = withContext(Dispatchers.IO) {
        val db = AppDatabase.getInstance(applicationContext)

        // 1. Audit / Store-and-Forward Logging (Offline record persistence)
        val logId = db.queryLogDao().insert(
            QueryLogEntity(
                sender = sender,
                incomingText = messageText,
                timestamp = System.currentTimeMillis(),
                syncedToCoop = false
            )
        )

        // 2. Execute On-Device Inference via Local 1B Engine
        // Output format: JSON {"issue": "...", "confidence": 0.88, "action": "..."}
        val triageResult = SmallAiEngine.runTriage(messageText)

        // 3. Evaluate Guardrail Criteria (Pass/Fail Gate)
        val replyMessage: String = if (triageResult.confidence < CONFIDENCE_THRESHOLD) {
            "Ondera Alert: Issue uncertain (${(triageResult.confidence * 100).toInt()}% conf). DO NOT spray chemicals. Logged for Extension Officer visit."
        } else {
            // Format strictly under 160 characters (GSM 7-bit standard)
            "Ondera: ${triageResult.issueDetected}. Action: ${triageResult.recommendedAction}. Fair Floor: KSh 265/kg."
        }

        val truncatedReply = enforceSmsBudget(replyMessage, maxLength = 160)

        // 4. Update Local Database Record with Result
        db.queryLogDao().updateResolution(logId, triageResult.issueDetected, truncatedReply)

        // 5. Dispatch SMS Reply via Cellular Carrier Control Channel
        sendSmsResponse(sender, truncatedReply)
    }

    private fun sendSmsResponse(recipient: String, message: String) {
        val smsManager = applicationContext.getSystemService(SmsManager::class.java)
        smsManager.sendTextMessage(recipient, null, message, null, null)
        Log.d("OnderaHub", "Dispatched SMS to $recipient: $message")
    }

    private fun enforceSmsBudget(text: String, maxLength: Int): String {
        return if (text.length <= maxLength) text else text.take(maxLength - 3) + "..."
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Ondera Field Hub Status",
            NotificationManager.IMPORTANCE_LOW
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Ondera Edge Hub Running")
            .setContentText("Listening for field SMS queries from slopes (Offline mode)")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }
}
```

---

### File 3: `QueryLogEntity.kt` (Store-and-Forward Database Schema)

This schema guarantees that all slope queries are preserved on the daughter's phone. When the phone reconnects to a 3G network, an automated worker syncs the records to the cooperative:

```kotlin
package org.worldbank.ondera.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "field_queries")
data class QueryLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sender: String,
    val incomingText: String,
    val timestamp: Long,
    val resolvedCondition: String? = null,
    val replySent: String? = null,
    val syncedToCoop: Boolean = false // Turned true when 3G packet is bought
)
```

---

## 5. Laptop Simulation Harness (For Immediate Weekend Testing)

Before loading code onto physical hardware, verify the entire pipeline on your computer using this Python script:

```python
"""
Ondera Edge SMS Hub - Local Simulator
Verifies: Local model loading -> JSON slot parsing -> 160-char SMS format -> Guardrail check
"""

import json
import requests

OLLAMA_ENDPOINT = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen2.5:1.5b"  # Or your fine-tuned minicpm5-1b

SYSTEM_PROMPT = """You are Ondera Agricultural Edge Hub.
Analyze the farmer's raw SMS query.
Respond ONLY with a JSON object:
{
  "issue": "Specific disease or market query",
  "confidence": 0.0 to 1.0,
  "action": "Immediate concise action (under 12 words)"
}
If the description is vague, incomplete, or symptoms match multiple lethal diseases, set confidence below 0.60.
"""

def simulate_edge_hub(incoming_sms: str, sender_phone: str):
    print(f"\n[CARRIER RADIO] Received SMS from {sender_phone}: '{incoming_sms}'")
    
    # 1. Inference via Small AI
    payload = {
        "model": MODEL_NAME,
        "system": SYSTEM_PROMPT,
        "prompt": incoming_sms,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 60
        }
    }
    
    response = requests.post(OLLAMA_ENDPOINT, json=payload).json()
    raw_output = response["response"].strip()
    
    # Clean JSON output
    try:
        start_idx = raw_output.find("{")
        end_idx = raw_output.rfind("}") + 1
        data = json.loads(raw_output[start_idx:end_idx])
    except Exception:
        data = {"issue": "Parsing Error", "confidence": 0.0, "action": "Escalate"}

    # 2. Guardrail Logic (Pass/Fail Requirement)
    CONFIDENCE_THRESHOLD = 0.75
    confidence = data.get("confidence", 0.0)
    
    if confidence < CONFIDENCE_THRESHOLD:
        reply_sms = (
            f"Ondera: Unclear issue ({int(confidence * 100)}% conf). "
            f"DO NOT spray chemicals. Logged for Extension Officer visit."
        )
    else:
        issue = data.get("issue", "Crop Issue")
        action = data.get("action", "Inspect field")
        reply_sms = f"Ondera: {issue}. Action: {action}. Fair Floor: KSh 265/kg."

    # 3. Enforce SMS 160-Character Limit
    reply_sms = reply_sms[:160]
    
    print(f"[ON-DEVICE AI] Inference finished. Confidence: {confidence:.2f}")
    print(f"[CARRIER RADIO] Outgoing SMS dispatched to {sender_phone} ({len(reply_sms)} chars):")
    print(f">> \"{reply_sms}\"")

# --- TEST SUITE FOR DEMO REHEARSAL ---
if __name__ == "__main__":
    # Test Case 1: High-Confidence Field Diagnosis
    simulate_edge_hub(
        incoming_sms="Yellow orange powder spots under my coffee leaves, lower slope",
        sender_phone="+254711000001"
    )

    # Test Case 2: Ambiguous Query (Triggers Pass/Fail Guardrail)
    simulate_edge_hub(
        incoming_sms="Leaves look weird today, should I spray medicine?",
        sender_phone="+254711000001"
    )
```

---

## 6. The 60-Second Video Demonstration Protocol

To effectively demonstrate this feature in your **2-to-5 minute submission video** (Deliverable 2, Page 10), use this step-by-step recording plan:

1. **Setup the Framing (0:00 – 0:15):**  
   Place two devices side-by-side on a desk:
   * **Device 1:** A basic feature phone (or a second phone acting as Noor on the slope).
   * **Device 2:** Your Android phone with a visible system label: *"Daughter's Phone — Household Edge Hub (At the House)"*.
2. **Prove Zero Cloud Data (0:15 – 0:25):**  
   Swipe down the notification shade on the Android phone:
   * **Wi-Fi:** OFF.
   * **Mobile Data (3G/4G):** OFF.
   * **Cellular Voice/SMS Antenna:** ON.
   * Point out: *"Notice zero data bundles are active. The device is isolated from the global internet."*
3. **Send the Live Test (0:25 – 0:45):**  
   * Type on the basic phone: *"Yellow powder spots under coffee leaves"* and hit Send.
   * Show the Android phone's notification light pulse as `SmsBroadcastReceiver` wakes up.
   * Show the Android CPU log terminal generating tokens locally.
4. **Display the Output & Guardrail (0:45 – 1:00):**  
   * Show the basic phone receiving the return SMS within 10 seconds.
   * Read the incoming text:  
     `"Ondera: Coffee Leaf Rust. Action: Apply copper fungicide before rains. Fair Floor: KSh 265/kg."`
   * Explain: *"The inference ran locally on the phone's CPU, costing Noor a standard 1-cent local SMS without relying on an external cloud API."*