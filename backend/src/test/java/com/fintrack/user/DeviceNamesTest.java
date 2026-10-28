package com.fintrack.user;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** REQ-4.2: зрозумілі назви пристроїв у списку активних сеансів. */
class DeviceNamesTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', nullValues = "NULL", value = {
            "Мій ноутбук|Chrome/131 Windows|Мій ноутбук",
            "NULL|NULL|Невідомий пристрій",
            "NULL|Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/131.0 Safari/537 Edg/131.0|Edge · Windows",
            "NULL|Mozilla/5.0 (Linux; Android 15) Chrome/131.0 Mobile Safari/537|Chrome · Android",
            "NULL|Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604|Safari · iOS",
            "NULL|Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5; rv:132.0) Firefox/132.0|Firefox · macOS",
            "NULL|Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0 OPR/115.0|Opera · Linux",
            "NULL|curl/8.9.1|браузер · Інша ОС"
    })
    void resolvesHumanReadableDeviceName(String explicitName, String userAgent, String expected) {
        assertThat(DeviceNames.resolve(explicitName, userAgent)).isEqualTo(expected);
    }
}
