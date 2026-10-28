package com.fintrack.user.sync;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Подія зміни даних користувача. Після коміту транзакції розсилається на всі його пристрої,
 * щоб клієнти оновили відповідні дані. originClientId дозволяє пристрою-ініціатору проігнорувати власну подію.
 */
public record SyncEvent(Long userId, String entity, String action, Long entityId, String originClientId) {

    public static final String CLIENT_ID_HEADER = "X-Client-Id";

    public static SyncEvent of(Long userId, String entity, String action, Long entityId) {
        return new SyncEvent(userId, entity, action, entityId, currentClientId());
    }

    private static String currentClientId() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servletAttributes) {
            return servletAttributes.getRequest().getHeader(CLIENT_ID_HEADER);
        }
        return null;
    }
}
