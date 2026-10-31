# Franks24 Dispatch — driver-to-dispatcher communications
Status: design proposal, not deployed. Date: 2026-10-31.

## Product decision
Use **hands-free cellular/SIP voice for urgent exceptions** and **in-portal, assignment-scoped messages for non-urgent coordination**. Do not require drivers to type, read long messages or tap through controls while driving. Messages remain pending until the driver is safely parked; the dispatcher receives explicit delivery and acknowledgement states, not fabricated read receipts.

The national South African road traffic regulation 308A forbids hand-held communication device use while driving, and permits operation only with the relevant mounted/hands-free equipment. This product must not incentivize unsafe interaction. A driver's declared `on_route` status cannot be interpreted as automatic proof of motion or parking.

## Staff dashboard behavior
- Each verified delivery/assignment shows **Call driver**, **Send message**, **Request status**, and **Report exception**.
- Call driver is the primary urgent option. Initially it may open a native, user-confirmed dialer only when an approved dispatcher has permission to retrieve the driver's work number. Prefer later server-side click-to-call bridging via Skunkworks Voice/Asterisk; the caller should not need direct exposure to a driver's personal number.
- Message thread is scoped to the delivery ID; only the assigned driver and authorised dispatchers can participate. No messaging to an arbitrary contact from client-supplied UID or phone.
- Show `sent`, `delivered` and `acknowledged` based only on actual durable events. Failed/expired pushes are not read receipts.
- Provide dispatcher-side exception escalation when the driver cannot be reached. Do not auto-change delivery status from chat or call events.
- Driver interface has prominent one-tap, non-text status controls when stationary: `At pickup`, `Collected`, `Delayed`, `Need assistance`, `Delivered`. During a trip, hide the chat composer and display **Messages available when stopped**. Consider hands-free voice calls only when lawfully and safely configured.
- No unsolicited route or location tracking is necessary for chat. GPS is a separately consented feature and may be inaccurate/offline.

## Proposed architecture
1. **Identity**: Firebase Auth (Google for dispatcher; separate verified driver identity) and server-side authorisation per request. A dispatcher token alone must not confer driver or telephony admin rights.
2. **Assignments**: the backend resolves `shipmentId -> assignedDriverUid` and current verified driver status. No client-side assignment changes.
3. **Messages**: `dispatchComms/{shipmentId}/messages/{messageId}` with immutable server-set `senderUid`, `role`, `createdAt`, `kind`, optional safe text (e.g. <=1000 chars). Allow append-only messages and controlled acknowledgement; an authorised backend validates each mutation, enforces per-shipment membership and rate limits, audits access, and applies a reviewed retention schedule.
4. **Notifications**: Firebase Cloud Messaging for optional app/web push, with explicit device permission, HTTPS service worker and token registration. Push includes no recipient address or personal information; tapping opens the protected thread. Offline retry is durable; delivery is not guaranteed.
5. **Voice**: use ordinary cellular/SIP calls as the first practical channel. A server-side bridge or Asterisk AMI/ARI Originate integration is a later phase, secured on a private service network with scoped credentials, destination allowlisting, per-operator rate limits, incident audit and outbound fraud controls. Never expose SIP secrets, AMI credentials or phone numbers in public static JS. Recording defaults off unless a lawful basis, disclosures, retention and operator policy are approved.
6. **Safety**: driver messages are reviewed while parked. No auto-play of texts, no required on-road typing or reading; optional hands-free call requires safe equipment. An SOS call/alert should be prioritised and should never silently modify delivery state.
7. **Compliance**: follow POPIA data minimisation, least-privilege access, secure media/message retention and deletion rules, location consent, driver contact privacy, notification consent, and audit event protections.

## API contract (planned, not live)
- `GET /api/dispatcher/shipments/{id}/comms`: verify role and active assignment, return messages with pagination.
- `POST /api/dispatcher/shipments/{id}/comms`: validated text, idempotency key; rate-limited immutable entry, emit optional FCM event.
- `POST /api/driver/shipments/{id}/comms`: verified assigned driver, validated short text or structured exception; must be safe to use only when parked.
- `POST /api/dispatcher/shipments/{id}/callback`: authorised, auditable request to the telephony bridge. Explicitly gated until approved trunk/voice system exists.
- `POST /api/driver/shipments/{id}/ack`: actual signed-in driver acknowledgement, not inferred from a push.
- `GET /api/dispatcher/shipments/{id}/comms/status`: bounded latest state for operators; no simulated driver presence.

## Release sequence
A. Implement staff messaging inbox and driver identity/assignment checks in staging, with emulator tests for cross-account access, revoked driver, removed dispatcher group and deleted assignment.
B. Add safe driver UI, FCM delivery and offline/retry UX after tested notification consent, PWA push behavior and driver training.
C. Add hands-free click-to-call via carrier/SIP/Asterisk only after credentials, routing, number privacy, cost controls and incident logging are reviewed.
D. Validate on physical Android and iOS devices, including absent connectivity, driving safety copy, rate limits, call failure, cancellation and emergency escalations.
E. Release separately from WhatsApp integration (deferred) and separately from GPS/live ratings, which require legitimate trip and consent data.

## Reference documentation
- National Road Traffic Regulation 308A: https://api.acts.co.za/national-road-traffic-act-1996/r225_308a__prohibition_on_use_.php
- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging/web/get-started
- Apple web push: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Asterisk AMI Originate: https://docs.asterisk.org/Latest_API/API_Documentation/AMI_Actions/Originate/

No communications APIs, calls, chat delivery or push notifications are activated by this design document.
