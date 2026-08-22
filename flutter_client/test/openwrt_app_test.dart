import 'package:flutter_test/flutter_test.dart';

import 'package:openwrt_status_flutter/openwrt_app.dart';

void main() {
  testWidgets('shows no router preview when native library is unavailable', (
    tester,
  ) async {
    await tester.pumpWidget(const OpenWrtStatusApp());
    await tester.pumpAndSettle();

    expect(find.text('Rust 原生库不可用'), findsOneWidget);
    expect(find.text('OpenWrt 主路由'), findsNothing);
    expect(find.text('预览数据'), findsNothing);
  });

  testWidgets('switches to settings through bottom navigation', (tester) async {
    await tester.pumpWidget(const OpenWrtStatusApp());

    await tester.tap(find.text('设置'));
    await tester.pumpAndSettle();

    expect(find.text('外观'), findsOneWidget);
    expect(find.text('跟随系统'), findsOneWidget);
    expect(find.text('状态刷新间隔'), findsOneWidget);
  });
}
