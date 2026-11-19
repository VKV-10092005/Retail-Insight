import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../providers/app_state.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool obscure = true;

  static const demoAccounts = [
    _DemoAccount('Chủ cửa hàng', 'vuong4651050332@st.qnu.edu.vn'),
    _DemoAccount('Quản lý', 'manager@cuahang.vn'),
    _DemoAccount('Thu ngân', 'cashier@cuahang.vn'),
  ];

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  void fillDemo(_DemoAccount account) {
    email.text = account.email;
    password.clear();
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {});
  }

  Future<void> submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    try {
      await context.read<AppState>().login(email.text, password.text);
    } catch (_) {}
  }

  Future<void> editServer() async {
    final state = context.read<AppState>();
    final controller = TextEditingController(
      text: state.baseUrl.replaceFirst('/api/v1', ''),
    );
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.dns_outlined, color: AppTheme.primary),
        title: const Text('Kết nối máy chủ'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Nhập địa chỉ máy tính chạy Backend trong cùng mạng LAN.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.url,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Địa chỉ server',
                hintText: 'http://192.168.1.10:3000',
                prefixIcon: Icon(Icons.language_rounded),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Lưu kết nối'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value != null && mounted) {
      try {
        await state.updateServerUrl(value);
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(error.toString())));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      backgroundColor: AppTheme.canvas,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final contentHeight = constraints.maxHeight < 760
              ? 760.0
              : constraints.maxHeight;
          return SingleChildScrollView(
            child: SizedBox(
              height: contentHeight,
              child: Stack(
                children: [
                  const _BrandHero(),
                  Positioned(
                    top: 18,
                    right: 18,
                    child: SafeArea(
                      child: _ServerButton(onPressed: editServer),
                    ),
                  ),
                  Positioned.fill(
                    top: 226,
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 460),
                          child: _LoginCard(
                            email: email,
                            password: password,
                            obscure: obscure,
                            busy: state.busy,
                            error: state.error,
                            onTogglePassword: () =>
                                setState(() => obscure = !obscure),
                            onSubmit: submit,
                            onDemoSelected: fillDemo,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _BrandHero extends StatelessWidget {
  const _BrandHero();

  @override
  Widget build(BuildContext context) => Container(
    height: 285,
    width: double.infinity,
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [AppTheme.primary, AppTheme.purple],
      ),
      borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
    ),
    child: Stack(
      children: [
        Positioned(left: -55, top: -70, child: _Glow(size: 190)),
        Positioned(right: -42, bottom: -54, child: _Glow(size: 175)),
        SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 35),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(22),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: .16),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: .28),
                          ),
                        ),
                        child: const Icon(
                          Icons.insights_rounded,
                          color: Colors.white,
                          size: 38,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 13),
                  const Text(
                    'Retail Insight',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 27,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.5,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Nền tảng quản lý bán lẻ & dự báo thông minh',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: .82),
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: Colors.white.withValues(alpha: .07),
    ),
  );
}

class _ServerButton extends StatelessWidget {
  const _ServerButton({required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white.withValues(alpha: .14),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: BorderSide(color: Colors.white.withValues(alpha: .24)),
    ),
    child: IconButton(
      onPressed: onPressed,
      tooltip: 'Cấu hình máy chủ',
      color: Colors.white,
      icon: const Icon(Icons.dns_outlined, size: 21),
    ),
  );
}

class _LoginCard extends StatelessWidget {
  const _LoginCard({
    required this.email,
    required this.password,
    required this.obscure,
    required this.busy,
    required this.error,
    required this.onTogglePassword,
    required this.onSubmit,
    required this.onDemoSelected,
  });

  final TextEditingController email;
  final TextEditingController password;
  final bool obscure;
  final bool busy;
  final String? error;
  final VoidCallback onTogglePassword;
  final VoidCallback onSubmit;
  final ValueChanged<_DemoAccount> onDemoSelected;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(24, 27, 24, 24),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: AppTheme.border.withValues(alpha: .8)),
      boxShadow: const [
        BoxShadow(
          color: Color(0x1A0F172A),
          blurRadius: 30,
          offset: Offset(0, 14),
        ),
      ],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Đăng nhập hệ thống',
          style: TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 23,
            fontWeight: FontWeight.w800,
            letterSpacing: -.35,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Nhập thông tin tài khoản cửa hàng của bạn',
          style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(
            labelText: 'Email',
            hintText: 'tenban@cuahang.vn',
            prefixIcon: Icon(Icons.alternate_email_rounded),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: password,
          obscureText: obscure,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => onSubmit(),
          decoration: InputDecoration(
            labelText: 'Mật khẩu',
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(
              onPressed: onTogglePassword,
              icon: Icon(
                obscure
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
            ),
          ),
        ),
        if (error != null)
          Container(
            margin: const EdgeInsets.only(top: 13),
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF2F2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 18,
                  color: Color(0xFFDC2626),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    error!,
                    style: const TextStyle(
                      color: Color(0xFFB91C1C),
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 20),
        SizedBox(
          height: 52,
          child: FilledButton(
            onPressed: busy ? null : onSubmit,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: busy
                  ? const SizedBox.square(
                      key: ValueKey('loading'),
                      dimension: 21,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.3,
                        color: Colors.white,
                      ),
                    )
                  : const Row(
                      key: ValueKey('label'),
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('Đăng nhập'),
                        SizedBox(width: 8),
                        Icon(Icons.arrow_forward_rounded, size: 19),
                      ],
                    ),
            ),
          ),
        ),
        const SizedBox(height: 22),
        const Row(
          children: [
            Expanded(child: Divider(color: AppTheme.border)),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 10),
              child: Text(
                'TÀI KHOẢN DEMO',
                style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: .8,
                ),
              ),
            ),
            Expanded(child: Divider(color: AppTheme.border)),
          ],
        ),
        const SizedBox(height: 13),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 7,
          runSpacing: 7,
          children: _LoginScreenState.demoAccounts
              .map(
                (account) => ActionChip(
                  avatar: Icon(account.icon, size: 16),
                  label: Text(account.label),
                  onPressed: () => onDemoSelected(account),
                  side: const BorderSide(color: AppTheme.border),
                  backgroundColor: const Color(0xFFF8FAFC),
                  labelStyle: const TextStyle(
                    color: Color(0xFF475569),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              )
              .toList(),
        ),
      ],
    ),
  );
}

class _DemoAccount {
  const _DemoAccount(this.label, this.email);
  final String label;
  final String email;

  IconData get icon => switch (label) {
    'Chủ cửa hàng' => Icons.storefront_outlined,
    'Quản lý' => Icons.badge_outlined,
    _ => Icons.point_of_sale_outlined,
  };
}
