import 'package:flutter_test/flutter_test.dart';

import 'package:openwrt_status_flutter/openwrt_app.dart';

void main() {
  testWidgets('renders the default-branch-inspired status dashboard', (
    tester,
  ) async {
    await tester.pumpWidget(const OpenWrtStatusApp());

    expect(find.text('当前路由器'), findsOneWidget);
    expect(find.text('OpenWrt 主路由'), findsOneWidget);
    expect(find.text('实时流量'), findsOneWidget);
  });

  testWidgets('switches to settings through bottom navigation', (tester) async {
    await tester.pumpWidget(const OpenWrtStatusApp());

    await tester.tap(find.text('设置'));
    await tester.pumpAndSettle();

    expect(find.text('外观'), findsOneWidget);
    expect(find.text('跟随系统'), findsOneWidget);
    expect(find.text('状态刷新间隔'), findsOneWidget);
  });

  test('keeps Rust preview payloads distinct from live router state', () {
    final preview = DashboardPreview.fromJson({
      'source': 'preview',
      'online': true,
      'interfaces': const [],
      'traffic': const [],
    });

    expect(preview.isPreview, isTrue);
    expect(preview.online, isTrue);
  });
}
