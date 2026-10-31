// Local simulation only. No credentials, payments or operational API calls.
enum ProofMethod { photo, pin, signature }
class PilotJob {
  PilotJob({required this.pickup, required this.dropoff, required this.totalMinor,
    this.commissionBps = 1500});
  final String pickup, dropoff;
  final int totalMinor, commissionBps;
  String status = 'posted';
  String? driver, tracking;
  int get commissionMinor => (totalMinor * commissionBps + 5000) ~/ 10000;
  int get driverMinor => totalMinor - commissionMinor;
  bool accept(String approvedDriver) {
    if (status != 'posted') return false;
    driver = approvedDriver;
    // Deliberately unusable as a real public tracking credential.
    tracking = 'DEMO-${DateTime.now().microsecondsSinceEpoch}';
    status = 'accepted';
    return true;
  }
  void collect() {
    if (status != 'accepted') throw StateError('Accept the job first.');
    status = 'collected';
  }
  void deliver(Set<ProofMethod> evidence, {Set<ProofMethod>? requiredMethods}) {
    if (status != 'collected') throw StateError('Collect the parcel first.');
    if (evidence.isEmpty || (requiredMethods != null && !evidence.containsAll(requiredMethods))) {
      throw StateError('Required delivery proof is missing.');
    }
    status = 'delivered';
  }
}
