package com.fintrack.config;

import com.fintrack.budgeting.budget.BudgetScheduler;
import com.fintrack.operations.recurring.RecurringScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Конфігурація з увімкненим входом через Google (REQ-4.1) і планувальником (REQ-1.3, REQ-2.4). */
@SpringBootTest(properties = {
        "fintrack.oauth2.google.client-id=test-client-id",
        "fintrack.oauth2.google.client-secret=test-client-secret",
        "fintrack.scheduling.enabled=true",
        "spring.datasource.url=jdbc:h2:mem:fintrack_oauth;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GoogleOAuthAndSchedulingIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private RecurringScheduler recurringScheduler;

    @Autowired
    private BudgetScheduler budgetScheduler;

    @Test
    void googleLoginStartsAuthorizationCodeFlow() throws Exception {
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.google").value(true));

        String location = mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andReturn().getResponse().getRedirectedUrl();
        assertThat(location)
                .startsWith("https://accounts.google.com/o/oauth2/v2/auth")
                .contains("client_id=test-client-id")
                .contains("redirect_uri=http://localhost/login/oauth2/code/google")
                .contains("scope=openid%20profile%20email");
    }

    @Test
    void failedGoogleCallbackReturnsToSpaLoginPage() throws Exception {
        mvc.perform(get("/login/oauth2/code/google").param("code", "forged").param("state", "unknown"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("http://localhost:5173/login?error=oauth"));
    }

    @Test
    void schedulersAreRegisteredAndRunTheirJobs() {
        assertThatCode(() -> {
            recurringScheduler.processDue();
            budgetScheduler.openNewPeriods();
        }).doesNotThrowAnyException();
    }
}
