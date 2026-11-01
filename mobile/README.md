# Franks24 Android pilot

This is an isolated local simulation, not an authenticated operational client.
It does not call Firebase, charge money, capture evidence, send messages, or
publish a tracking link. Switching tabs does not grant any real role.

Implemented: validated pickup/drop-off/fee entry, repeat previous booking,
simulated payment and posting, first local acceptance, collection and simulated
single-method proof, 15% commission in integer cents, and demo tracking copy.
The model also supports requiring a set of proof methods.

Run with Flutter 3.35.7:

```sh
cd mobile
flutter create --platforms=android --org com.franks24 --project-name franks24_mobile .
flutter pub get
flutter test
flutter run
```

The Android local pilot workflow runs analysis/tests and generates an installable
**debug-signed** APK as a CI artifact. It is for internal testing only, not a
release-signed APK or Play Store submission. CI has not been run by creation of
this source alone. A local Flutter SDK was unavailable during authoring.

Remaining: authenticated role-specific navigation and approved-driver access;
backend transactional open-job acceptance; public opaque tracking tokens and
native sharing; actual photo/PIN/signature validation; parcel/profile capture;
admin users and configurable policies; verified marketplace checkout and payout
integration; payment webhook/idempotency/refund handling; release signing and
real Android device testing. Existing backend offers are assigned to a specific
driver, so they must not be represented as an implemented open marketplace.
Never connect this demo to production or treat client state as payment proof.
