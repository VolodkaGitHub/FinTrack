package com.fintrack.user;

import org.springframework.util.StringUtils;

/** Людська назва пристрою для списку активних сесій (REQ-4.2). */
final class DeviceNames {

    private DeviceNames() {
    }

    static String resolve(String explicitName, String userAgent) {
        if (StringUtils.hasText(explicitName)) {
            return truncate(explicitName.trim());
        }
        if (!StringUtils.hasText(userAgent)) {
            return "Невідомий пристрій";
        }
        String os = userAgent.contains("Android") ? "Android"
                : userAgent.contains("iPhone") || userAgent.contains("iPad") ? "iOS"
                : userAgent.contains("Windows") ? "Windows"
                : userAgent.contains("Mac OS") ? "macOS"
                : userAgent.contains("Linux") ? "Linux"
                : "Інша ОС";
        String browser = userAgent.contains("Edg/") ? "Edge"
                : userAgent.contains("OPR/") ? "Opera"
                : userAgent.contains("Firefox/") ? "Firefox"
                : userAgent.contains("Chrome/") ? "Chrome"
                : userAgent.contains("Safari/") ? "Safari"
                : "браузер";
        return browser + " · " + os;
    }

    private static String truncate(String value) {
        return value.length() > 255 ? value.substring(0, 255) : value;
    }
}
