package com.fintrack.user;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintrack.common.ApiException;
import com.fintrack.support.MutableClock;
import com.fintrack.user.UserDtos.AuthTokens;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.greaterThan;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** REQ-4.1: реєстрація → підтвердження пошти → вхід → ротація refresh-токена → вихід; вхід через Google. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthFlowIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private MutableClock clock;

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository users;

    @MockitoBean
    private MailService mailService;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    @Test
    void registerVerifyLoginRefreshAndLogout() throws Exception {
        String email = "olena-" + System.nanoTime() + "@test.local";
        register(email, "secret123", "Олена").andExpect(status().isAccepted());

        String link = sentLinks(1).get(0);
        assertThat(link).startsWith("http://localhost:5173/verify-email?token=");
        String token = token(link);

        String loginBody = body(Map.of("email", email.toUpperCase(), "password", "secret123"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));

        confirm(token)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.emailVerified").value(true))
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
        confirm(token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TOKEN_USED"));

        login(email, "wrong-password1")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"));

        JsonNode login = json.readTree(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0")
                        .content(loginBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        String access = login.get("accessToken").asText();
        String refresh = login.get("refreshToken").asText();

        mvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.displayName").value("Олена"));
        mvc.perform(get("/api/categories").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(greaterThan(10)));
        mvc.perform(get("/api/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/users/me/sessions").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.current == true)].deviceName").value("Chrome · Windows"));
        mvc.perform(get("/api/accounts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer broken.token.value"))
                .andExpect(status().isUnauthorized());

        // ротація: старий refresh-токен після використання стає недійсним
        JsonNode rotated = json.readTree(mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer expired-or-invalid")
                        .content(body(Map.of("refreshToken", refresh))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        String newRefresh = rotated.get("refreshToken").asText();
        assertThat(newRefresh).isNotEqualTo(refresh);
        refresh(refresh).andExpect(status().isUnauthorized());

        mvc.perform(post("/api/auth/logout").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("refreshToken", newRefresh))))
                .andExpect(status().isNoContent());
        refresh(newRefresh).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/logout").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("refreshToken", "unknown-token"))))
                .andExpect(status().isNoContent());
    }

    @Test
    void registeringAgainBeforeConfirmationReplacesLinkAndConfirmedEmailIsTaken() throws Exception {
        String email = "repeat-" + System.nanoTime() + "@test.local";
        register(email, "secret123", "Олена").andExpect(status().isAccepted());
        register(email, "newpass123", "Ольга").andExpect(status().isAccepted());
        List<String> links = sentLinks(2);

        confirm(token(links.get(0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        confirm(token(links.get(1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.displayName").value("Ольга"));
        login(email, "secret123").andExpect(status().isUnauthorized());
        login(email, "newpass123").andExpect(status().isOk());
        register(email, "another123", "Олена").andExpect(status().isConflict());
    }

    @Test
    void expiredLinkIsRejectedAndNewOneCanBeRequested() throws Exception {
        String email = "expired-" + System.nanoTime() + "@test.local";
        register(email, "secret123", "Олена").andExpect(status().isAccepted());
        String first = token(sentLinks(1).get(0));

        clock.setInstant(Instant.now().plus(Duration.ofHours(25)));
        confirm(first)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
        clock.reset();

        mvc.perform(post("/api/auth/resend-verification").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("email", email))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/resend-verification").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("email", "nobody-" + System.nanoTime() + "@test.local"))))
                .andExpect(status().isOk());
        confirm(token(sentLinks(2).get(1))).andExpect(status().isOk());
        confirm("not-a-real-token")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    @Test
    void googleAccountsAreCreatedOrLinkedByEmail() throws Exception {
        long nano = System.nanoTime();
        String email = "google-" + nano + "@gmail.com";
        AuthTokens tokens = authService.loginWithGoogle("g1-" + nano, email.toUpperCase(), true, "Google User", "Chrome · Android");
        User created = users.findByGoogleId("g1-" + nano).orElseThrow();
        assertThat(created.getEmail()).isEqualTo(email);
        assertThat(created.getAuthProvider()).isEqualTo(User.AuthProvider.GOOGLE);
        assertThat(created.isEmailVerified()).isTrue();
        assertThat(created.getPasswordHash()).isNull();
        mvc.perform(get("/api/categories").header(HttpHeaders.AUTHORIZATION, "Bearer " + tokens.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(greaterThan(10)));

        authService.loginWithGoogle("g1-" + nano, email, true, "Google User", "Safari · iOS");
        assertThat(users.findByEmail(email).orElseThrow().getId()).isEqualTo(created.getId());

        String local = "local-" + nano + "@test.local";
        register(local, "secret123", "Локальний").andExpect(status().isAccepted());
        authService.loginWithGoogle("g2-" + nano, local, true, null, "Chrome · Windows");
        User linked = users.findByEmail(local).orElseThrow();
        assertThat(linked.getGoogleId()).isEqualTo("g2-" + nano);
        assertThat(linked.isEmailVerified()).isTrue();
        assertThat(linked.getAuthProvider()).isEqualTo(User.AuthProvider.LOCAL);
        login(local, "secret123").andExpect(status().isOk());

        authService.loginWithGoogle("g3-" + nano, "noname" + nano + "@gmail.com", true, null, "Chrome · Windows");
        assertThat(users.findByGoogleId("g3-" + nano).orElseThrow().getDisplayName()).isEqualTo("noname" + nano);

        assertThatThrownBy(() -> authService.loginWithGoogle("g4-" + nano, "x" + nano + "@gmail.com", false, "X", "d"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("EMAIL_NOT_VERIFIED"));
    }

    @Test
    void validationErrorsAreReportedPerField() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("email", "not-an-email", "password", "short", "displayName", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").exists())
                .andExpect(jsonPath("$.errors.displayName").exists());
    }

    @Test
    void googleProviderIsDisabledWithoutCredentials() throws Exception {
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.google").value(false));
        mvc.perform(get("/oauth2/authorization/google")).andExpect(status().isNotFound());
    }

    private ResultActions register(String email, String password, String name) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("email", email, "password", password, "displayName", name))));
    }

    private ResultActions confirm(String token) throws Exception {
        return mvc.perform(post("/api/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("token", token))));
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("email", email, "password", password))));
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("refreshToken", refreshToken))));
    }

    private List<String> sentLinks(int expectedCount) {
        ArgumentCaptor<String> links = ArgumentCaptor.forClass(String.class);
        verify(mailService, times(expectedCount)).sendVerificationEmail(any(User.class), links.capture());
        return links.getAllValues();
    }

    private static String token(String link) {
        return link.substring(link.indexOf("token=") + 6);
    }

    private String body(Map<String, String> values) throws Exception {
        return json.writeValueAsString(values);
    }
}
