import 'package:flutter_test/flutter_test.dart';
import 'package:franks24_mobile/pilot.dart';
void main() {
  test('commission conserves cents and snapshots the payout', () {
    final job = PilotJob(pickup: 'A', dropoff: 'B', totalMinor: 10001);
    expect(job.commissionMinor, 1500);
    expect(job.driverMinor + job.commissionMinor, 10001);
  });
  test('only first simulated acceptance wins and proof gates completion', () {
    final job = PilotJob(pickup: 'A', dropoff: 'B', totalMinor: 10000);
    expect(job.accept('first'), isTrue);
    expect(job.accept('second'), isFalse);
    expect(job.driver, 'first');
    expect(() => job.deliver({ProofMethod.photo}), throwsStateError);
    job.collect();
    expect(() => job.deliver({}), throwsStateError);
    expect(() => job.deliver({ProofMethod.photo}, requiredMethods: {ProofMethod.pin}), throwsStateError);
    job.deliver({ProofMethod.pin});
    expect(job.status, 'delivered');
  });
}
