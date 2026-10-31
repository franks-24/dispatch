import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'pilot.dart';
void main() => runApp(const PilotApp());
class PilotApp extends StatelessWidget {
  const PilotApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Franks24 · Dispatch pilot',
    theme: ThemeData(colorSchemeSeed: const Color(0xffdc2626), useMaterial3: true),
    home: const PilotHome());
}
class PilotHome extends StatefulWidget {
  const PilotHome({super.key});
  @override
  State<PilotHome> createState() => _PilotHomeState();
}
class _PilotHomeState extends State<PilotHome> {
  final pickup = TextEditingController(), dropoff = TextEditingController(), fee = TextEditingController();
  final form = GlobalKey<FormState>();
  final jobs = <PilotJob>[];
  int tab = 0;
  String money(int minor) => 'R${(minor / 100).toStringAsFixed(2)}';
  @override
  void dispose() { pickup.dispose(); dropoff.dispose(); fee.dispose(); super.dispose(); }
  void post() {
    if (!form.currentState!.validate()) return;
    final parts = fee.text.trim().split('.');
    final amount = int.parse(parts[0]) * 100 + int.parse(parts.length == 1 ? '0' : parts[1].padRight(2, '0'));
    setState(() => jobs.add(PilotJob(pickup: pickup.text.trim(), dropoff: dropoff.text.trim(), totalMinor: amount)));
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Test payment simulated. Demo job posted.')));
  }
  Widget field(TextEditingController controller, String label, {bool amount = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 12), child: TextFormField(controller: controller,
    keyboardType: amount ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.streetAddress,
    decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
    validator: (value) {
      final text = value?.trim() ?? '';
      if (text.isEmpty) return 'Required';
      if (amount && (!RegExp(r'^\d{1,6}(\.\d{1,2})?$').hasMatch(text) || (double.tryParse(text) ?? 0) <= 0)) return 'Enter a positive rand amount, up to two decimals';
      return null;
    }));
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Franks24 · Dispatch')),
    bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (v) => setState(() => tab = v),
      destinations: const [NavigationDestination(icon: Icon(Icons.add_box_outlined), label: 'Dispatch'),
      NavigationDestination(icon: Icon(Icons.local_shipping_outlined), label: 'Driver'),
      NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Summary')]),
    body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
      const Card(child: Padding(padding: EdgeInsets.all(12), child: Text('LOCAL DEMO · No real payments, sign-in, proof capture or live tracking. Role tabs are test views, not access permissions.'))),
      if (tab == 0) Form(key: form, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Post a parcel', style: TextStyle(fontSize: 24)), const SizedBox(height: 12),
        field(pickup, 'Pickup address'), field(dropoff, 'Drop-off address'), field(fee, 'Delivery fee (ZAR)', amount: true),
        const Text('15% platform commission. Any one delivery proof by default.'),
        FilledButton(onPressed: post, child: const Text('Simulate pay and post')),
        if (jobs.isNotEmpty) TextButton(onPressed: () { final previous = jobs.last; pickup.text = previous.pickup; dropoff.text = previous.dropoff; fee.text = (previous.totalMinor / 100).toStringAsFixed(2); }, child: const Text('Use previous parcel')),
      ])),
      if (jobs.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('No demo jobs yet. Create one in Dispatch.')),
      for (final job in jobs.reversed) Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${job.pickup} → ${job.dropoff}'), Text('Status: ${job.status}'),
        Text('Driver earns ${money(job.driverMinor)}'),
        if (tab != 1) Text('Platform: ${money(job.commissionMinor)} · Total: ${money(job.totalMinor)}'),
        if (tab == 1 && job.status == 'posted') FilledButton(onPressed: () => setState(() => job.accept('demo-approved-driver')), child: const Text('Accept demo job')),
        if (tab == 1 && job.status == 'accepted') FilledButton(onPressed: () => setState(job.collect), child: const Text('Mark collected')),
        if (tab == 1 && job.status == 'collected') Wrap(spacing: 8, children: [for (final method in ProofMethod.values) OutlinedButton(onPressed: () => setState(() => job.deliver({method})), child: Text('Simulate ${method.name} proof'))]),
        if (job.tracking != null) TextButton(onPressed: () async { await Clipboard.setData(ClipboardData(text: '${job.tracking} · Demo status: ${job.status}. Not a live tracking link.')); if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Demo tracking text copied'))); }, child: const Text('Copy demo tracking')),
        if (job.status == 'delivered') const Text('Demo earnings available · No bank payout made'),
      ]))),
    ])));
}
