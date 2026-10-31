import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:franks24_mobile/main.dart';

void main() {
  testWidgets('post and accept a simulated parcel on the pilot screens', (tester) async {
    await tester.pumpWidget(const PilotApp());
    expect(find.textContaining('LOCAL DEMO'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), 'Johannesburg');
    await tester.enterText(find.byType(TextFormField).at(1), 'Pretoria');
    await tester.enterText(find.byType(TextFormField).at(2), '100.00');
    final post = find.text('Simulate pay and post');
    await tester.ensureVisible(post);
    await tester.tap(post);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Driver'));
    await tester.pumpAndSettle();
    final accept = find.text('Accept demo job');
    await tester.ensureVisible(accept);
    await tester.tap(accept);
    await tester.pumpAndSettle();
    expect(find.text('Status: accepted'), findsOneWidget);
    expect(find.text('Driver earns R85.00'), findsOneWidget);
  });
}
