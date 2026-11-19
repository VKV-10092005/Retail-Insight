import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:retail_insight_mobile/core/theme/app_theme.dart';

void main() {
  testWidgets('Retail Insight theme renders Material 3 content', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const Scaffold(body: Text('Retail Insight')),
      ),
    );

    expect(find.text('Retail Insight'), findsOneWidget);
    expect(
      Theme.of(tester.element(find.text('Retail Insight'))).useMaterial3,
      isTrue,
    );
  });
}
