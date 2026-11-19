import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';

class SupportAndProfileScreen extends StatefulWidget {
  const SupportAndProfileScreen({super.key});

  @override
  State<SupportAndProfileScreen> createState() =>
      _SupportAndProfileScreenState();
}

class _SupportAndProfileScreenState extends State<SupportAndProfileScreen> {
  final messageController = TextEditingController();
  final scrollController = ScrollController();
  Timer? pollingTimer;
  int previousMessageCount = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final state = context.read<AppState>();
      previousMessageCount = state.supportMessages.length;
      state.loadSupport();
    });
    pollingTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) {
      if (mounted) context.read<AppState>().loadSupportMessages();
    });
  }

  @override
  void dispose() {
    pollingTimer?.cancel();
    messageController.dispose();
    scrollController.dispose();
    super.dispose();
  }

  void scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scrollController.hasClients) {
        scrollController.animateTo(
          scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> send() async {
    final value = messageController.text.trim();
    if (value.isEmpty) return;
    messageController.clear();
    scrollToEnd();
    try {
      await context.read<AppState>().sendSupportMessage(value);
      scrollToEnd();
    } catch (exception) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(exception.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.supportMessages.length != previousMessageCount) {
      previousMessageCount = state.supportMessages.length;
      scrollToEnd();
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Chat hỗ trợ trực tuyến',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        const Text('Trao đổi trực tiếp với đội ngũ Retail Insight.'),
        const SizedBox(height: 12),
        Card(
          clipBehavior: Clip.antiAlias,
          child: SizedBox(
            height: 410,
            child: Column(
              children: [
                Expanded(
                  child: state.supportThread == null
                      ? const Center(
                          child: Text('Chưa có cuộc trò chuyện hỗ trợ.'),
                        )
                      : ListView.builder(
                          controller: scrollController,
                          padding: const EdgeInsets.all(12),
                          itemCount: state.supportMessages.length,
                          itemBuilder: (context, index) {
                            final message = state.supportMessages[index];
                            final isMine =
                                message['sender_user_id']?.toString() ==
                                state.user?['id']?.toString();
                            return Align(
                              alignment: isMine
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: Container(
                                constraints: const BoxConstraints(
                                  maxWidth: 290,
                                ),
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 9,
                                ),
                                decoration: BoxDecoration(
                                  color: isMine
                                      ? Theme.of(context)
                                            .colorScheme
                                            .primaryContainer
                                      : Theme.of(context)
                                            .colorScheme
                                            .surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Text(
                                  message['content']?.toString() ?? '',
                                ),
                              ),
                            );
                          },
                        ),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: messageController,
                          minLines: 1,
                          maxLines: 3,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => send(),
                          decoration: const InputDecoration(
                            hintText: 'Nhập tin nhắn...',
                            isDense: true,
                          ),
                        ),
                      ),
                      IconButton.filled(
                        onPressed: state.supportThread == null ? null : send,
                        icon: const Icon(Icons.send),
                        tooltip: 'Gửi',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Tài khoản',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  state.user?['name']?.toString() ??
                      state.user?['full_name']?.toString() ??
                      'Người dùng',
                ),
                Text(state.user?['email']?.toString() ?? ''),
                Text('Vai trò: ${state.role}'),
                const Divider(height: 24),
                SegmentedButton<ThemeMode>(
                  segments: const [
                    ButtonSegment(
                      value: ThemeMode.light,
                      icon: Icon(Icons.light_mode),
                      label: Text('Sáng'),
                    ),
                    ButtonSegment(
                      value: ThemeMode.system,
                      icon: Icon(Icons.settings_suggest),
                      label: Text('Hệ thống'),
                    ),
                    ButtonSegment(
                      value: ThemeMode.dark,
                      icon: Icon(Icons.dark_mode),
                      label: Text('Tối'),
                    ),
                  ],
                  selected: {state.themeMode},
                  onSelectionChanged: (value) => state.setTheme(value.first),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: state.logout,
                  icon: const Icon(Icons.logout),
                  label: const Text('Đăng xuất'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
