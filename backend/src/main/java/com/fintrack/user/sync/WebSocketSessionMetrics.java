package com.fintrack.user.sync;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Метрика кількості пристроїв, підключених до синхронізації (для Prometheus/Grafana). */
@Component
public class WebSocketSessionMetrics {

    private final Set<String> sessions = ConcurrentHashMap.newKeySet();

    public WebSocketSessionMetrics(MeterRegistry registry) {
        Gauge.builder("fintrack.sync.connected.devices", sessions, Set::size)
                .description("Active real-time sync connections")
                .register(registry);
    }

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        String sessionId = (String) event.getMessage().getHeaders().get("simpSessionId");
        if (sessionId != null) {
            sessions.add(sessionId);
        }
    }

    @EventListener
    public void onDisconnected(SessionDisconnectEvent event) {
        sessions.remove(event.getSessionId());
    }
}
