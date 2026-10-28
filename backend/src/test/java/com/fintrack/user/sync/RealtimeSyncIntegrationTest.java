package com.fintrack.user.sync;

import com.fintrack.support.TestUsers;
import com.fintrack.support.TestUsers.TestUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** REQ-4.2: зміна на одному пристрої миттєво доходить до інших пристроїв того самого акаунта (і лише до них). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class RealtimeSyncIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private TestUsers testUsers;

    @Test
    void changesArePushedToOtherDevicesOfTheSameUser() throws Exception {
        TestUser owner = testUsers.create();
        TestUser stranger = testUsers.create();
        BlockingQueue<Map<String, Object>> ownerEvents = subscribe(owner);
        BlockingQueue<Map<String, Object>> strangerEvents = subscribe(stranger);

        List<Map<String, Object>> accounts = rest.exchange("/api/accounts", HttpMethod.GET,
                new HttpEntity<>(headers(owner)), List.class).getBody();
        List<Map<String, Object>> categories = rest.exchange("/api/categories", HttpMethod.GET,
                new HttpEntity<>(headers(owner)), List.class).getBody();
        Object accountId = accounts.get(0).get("id");
        Object categoryId = categories.stream().filter(c -> "Кафе та ресторани".equals(c.get("name"))).findFirst().orElseThrow().get("id");

        HttpHeaders headers = headers(owner);
        headers.set(SyncEvent.CLIENT_ID_HEADER, "phone-1");
        ResponseEntity<Map> created = rest.exchange("/api/transactions", HttpMethod.POST, new HttpEntity<>(Map.of(
                "type", "EXPENSE", "amount", 85, "date", LocalDate.now().toString(),
                "accountId", accountId, "categoryId", categoryId, "note", "Кава"), headers), Map.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        Map<String, Object> event = ownerEvents.poll(10, TimeUnit.SECONDS);
        assertThat(event).isNotNull();
        assertThat(event.get("entity")).isEqualTo("transactions");
        assertThat(event.get("action")).isEqualTo("created");
        assertThat(event.get("originClientId")).isEqualTo("phone-1");
        assertThat(((Number) event.get("id")).longValue()).isEqualTo(((Number) created.getBody().get("id")).longValue());
        assertThat(strangerEvents.poll(1, TimeUnit.SECONDS)).isNull();
    }

    @Test
    void connectionWithoutValidTokenIsRejected() {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer invalid");
        assertThatThrownBy(() -> client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(),
                connectHeaders, new StompSessionHandlerAdapter() {
                }).get(5, TimeUnit.SECONDS))
                .isInstanceOfAny(ExecutionException.class, TimeoutException.class);
    }

    private BlockingQueue<Map<String, Object>> subscribe(TestUser user) throws Exception {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setMessageConverter(new MappingJackson2MessageConverter());
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", user.bearer());
        StompSession session = client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(),
                connectHeaders, new StompSessionHandlerAdapter() {
                }).get(10, TimeUnit.SECONDS);
        BlockingQueue<Map<String, Object>> events = new LinkedBlockingQueue<>();
        session.subscribe("/user/queue/sync", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return Map.class;
            }

            @Override
            @SuppressWarnings("unchecked")
            public void handleFrame(StompHeaders headers, Object payload) {
                events.add((Map<String, Object>) payload);
            }
        });
        Thread.sleep(500); // підписка реєструється асинхронно
        return events;
    }

    private static HttpHeaders headers(TestUser user) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, user.bearer());
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}
