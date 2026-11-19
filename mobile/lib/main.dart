import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_shell.dart';
import 'providers/app_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();
  await state.initialize();
  runApp(
    ChangeNotifierProvider.value(value: state, child: const RetailInsightApp()),
  );
}

class RetailInsightApp extends StatelessWidget {
  const RetailInsightApp({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return MaterialApp(
      title: 'Retail Insight',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: state.themeMode,
      home: state.initializing
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : state.isAuthenticated
          ? const HomeShell()
          : const LoginScreen(),
    );
  }
}
