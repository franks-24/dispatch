import 'package:flutter/material.dart';

/// Shared Franks24 Dispatch visual tokens; web equivalent: assets/site-shell.css.
/// Native navigation remains platform-specific.
abstract final class Franks24Theme {
  static const primary = Color(0xFFC8202F);
  static const primarySoft = Color(0xFFFFE5E8);
  static const primaryPale = Color(0xFFFFF0F2);
  static const ink = Color(0xFF231F20);
  static const muted = Color(0xFF666168);
  static const line = Color(0xFFE6DFE1);

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      primary: primary,
      onPrimary: Colors.white,
      surface: Colors.white,
      onSurface: ink,
    ),
    scaffoldBackgroundColor: Colors.white,
    appBarTheme: const AppBarTheme(
      backgroundColor: primary,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      toolbarHeight: 80,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: primarySoft,
    ),
  );
}
