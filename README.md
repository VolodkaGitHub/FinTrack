# FinTrack

Вебзастосунок для обліку особистих і сімейних фінансів: доходи й витрати на кількох рахунках, бюджети за категоріями
з попередженнями, аналітика з прогнозом залишку, звіти PDF/Excel, імпорт/експорт CSV та синхронізація між пристроями
в реальному часі.

Реалізовано відповідно до специфікації вимог із розділу 2 звіту до лабораторної роботи №1 (проєкт FinTrack):
монолітний fullstack-застосунок — backend на Java (Spring Boot) з єдиною базою даних і SPA-клієнт на React;
розробка ведеться за Kanban (див. [docs/KANBAN.md](docs/KANBAN.md)).

## Технології

| Шар | Технології |
|---|---|
| Backend | Java 21, Spring Boot 3.5 (Web MVC, Data JPA/Hibernate, Validation, Security, OAuth2 Client, Resource Server/JWT, WebSocket/STOMP, Mail, Actuator), Flyway, Lombok |
| База даних | PostgreSQL 17 — єдина БД моноліту; схема керується міграціями Flyway |
| Frontend (SPA) | React 19, TypeScript, Vite, Mantine 8, TanStack Query, React Router, Recharts, STOMP.js, Day.js |
| Звіти та дані | OpenPDF (PDF з кирилицею), Apache POI (Excel), Apache Commons CSV |
| Безпека | JWT (access 15 хв + refresh-токен на пристрій з ротацією), BCrypt, Google OAuth 2.0, підтвердження email, PIN (PBKDF2) / біометрія (WebAuthn) на клієнті |
| Тестування | JUnit 5, Spring Boot Test, MockMvc, Mockito, H2, STOMP-клієнт, JaCoCo; Vitest, Testing Library, V8 coverage; Playwright (e2e) |
| DevOps | Docker, Docker Compose, nginx, GitHub Actions (CI/CD → GHCR → SSH-деплой), Prometheus, Grafana, Mailpit |
| API | REST + OpenAPI 3 / Swagger UI |

## Архітектура

```
 Браузер (ПК, телефон)                       docker compose
 ┌───────────────────────┐   HTTP / WS   ┌────────────────────────────────────────────────────────────┐
 │ React SPA             │──────────────▶│ nginx  ── статичний SPA                                    │
 │  • TanStack Query     │               │   │  /api, /oauth2, /swagger-ui  ──▶  Spring Boot :8080    │
 │  • STOMP-клієнт       │◀── події ─────│   │  /ws (WebSocket)              ──▶  (моноліт)            │
 │  • PIN / WebAuthn     │               │                                       │   ▲ :8081 actuator │
 └───────────────────────┘               │  PostgreSQL ◀── JPA + Flyway ─────────┘   │                │
                                         │  Mailpit (SMTP для листів підтвердження)  │                │
                                         │  Prometheus ──── збирає метрики ──────────┘ ──▶ Grafana    │
                                         └────────────────────────────────────────────────────────────┘
```

Моноліт поділено на пакети за модулями специфікації:

| Модуль (епік у Jira) | Пакет backend | Сторінки SPA |
|---|---|---|
| Облік операцій | `com.fintrack.operations` (account, transaction, recurring) | Операції, Рахунки, Регулярні платежі |
| Бюджетування та категорії | `com.fintrack.budgeting` (category, budget, notification) | Категорії, Бюджети, центр сповіщень |
| Аналітика та звітність | `com.fintrack.analytics` (+ report) | Огляд, Аналітика і звіти |
| Користувач та синхронізація | `com.fintrack.user` (+ sync, dataio) | Вхід/реєстрація, Налаштування |

## Відповідність вимогам

| Вимога | Як реалізовано | Перевірка |
|---|---|---|
| **REQ-1.1** Ручне додавання доходів і витрат (сума, категорія, дата, нотатка) · FIN-5 | `TransactionController`/`TransactionService`; форма «Операція» доступна з будь-якої сторінки | `FinanceFlowIntegrationTest`, `TransactionFormModal.test`, e2e «витрата зменшує залишок бюджету» |
| **REQ-1.2** Кілька рахунків/гаманців з окремими балансами · FIN-1 | `Account` (готівка/картка/накопичення/інше), `BalanceService` (початковий баланс ± операції ± перекази), архівування | `AccountApiIntegrationTest`, `AccountsPage.test`, e2e `api.spec` |
| **REQ-1.3** Швидке додавання регулярних операцій · FIN-3 | `RecurringTransaction` + щоденний планувальник: автостворення або нагадування; кнопка «Додати зараз», «Пропустити»; прапорець «Повторювати регулярно» у формі операції | `RecurringIntegrationTest`, `FrequencyTest`, `RecurringPage.test` |
| **REQ-1.4** Пошук і фільтрація за періодом, категорією, рахунком, сумою · FIN-4 | JPA Specifications: період, тип, рахунок, категорія з підкатегоріями, діапазон суми, текст у нотатці/назві категорії; підсумки знайденого | `FinanceFlowIntegrationTest`, `ErrorHandlingIntegrationTest`, `TransactionsPage.test` |
| **REQ-2.1** Власні категорії й підкатегорії з іконками та кольорами · FIN-2 | `Category` з `parentId`, 42 іконки, палітра кольорів; стартовий набір категорій для нового користувача | `CategoryApiIntegrationTest`, `CategoriesPage.test`, `categories.test` |
| **REQ-2.2** Місячний бюджет по категоріях із залишком у реальному часі · FIN-11 | `Budget` + `BudgetPeriod` (місячні періоди); залишок перераховується після кожної операції й надсилається на всі пристрої | `BudgetRolloverIntegrationTest`, `BudgetsPage.test`, e2e |
| **REQ-2.3** Сповіщення при наближенні/перевищенні бюджету · FIN-14 | Поріг (за замовчуванням 80%) і 100%: сповіщення в БД + push через WebSocket (toast, лічильник, системне сповіщення браузера) | `BudgetRolloverIntegrationTest`, `NotificationApiIntegrationTest`, `NotificationBell.test`, `SyncProvider.test`, e2e |
| **REQ-2.4** Перенесення невикористаного залишку або скидання · FIN-9 | Прапорець `rollover` бюджету; планувальник 1-го числа відкриває новий період і повідомляє про перенесені суми | `BudgetRolloverIntegrationTest` (перехід між місяцями з керованим годинником) |
| **REQ-3.1** Графіки розподілу витрат за категоріями · FIN-12 | Кругова діаграма з деталізацією до підкатегорій за довільний період | `FinanceFlowIntegrationTest`, `AnalyticsPage.test` |
| **REQ-3.2** Доходи vs витрати по місяцях з трендовою лінією | Комбінований графік (6/12/24 міс.) + лінійний тренд методом найменших квадратів від першого місяця обліку (`TrendLine`) | `TrendLineTest`, `ForecastIntegrationTest`, `AnalyticsPage.test` |
| **REQ-3.3** Зведений звіт PDF/Excel за період · FIN-13 | `PdfReportGenerator` (OpenPDF, шрифт DejaVu з кирилицею), `ExcelReportGenerator` (5 аркушів, формули) | `ReportContentIntegrationTest` (текст PDF, обчислення формул Excel), e2e завантаження |
| **REQ-3.4** Прогноз залишку до кінця місяця · FIN-16 | `ForecastService`: баланс + заплановані й регулярні платежі − середньоденні змінні витрати (зважено з історією 3 місяців) | `ForecastIntegrationTest` (точні значення на фіксовану дату), `AnalyticsPage.test` |
| **REQ-4.1** Реєстрація та вхід (email/пароль, Google OAuth) з підтвердженням пошти · FIN-15 | Лист із посиланням (токен зберігається як SHA-256), JWT + refresh-сесії, Google OAuth2 вмикається змінними оточення | `AuthFlowIntegrationTest`, `UserProfileIntegrationTest`, `GoogleOAuthAndSchedulingIntegrationTest`, `MailServiceTest`, `AuthPages.test`, e2e реєстрація |
| **REQ-4.2** Синхронізація між пристроями в реальному часі | STOMP over WebSocket: подія про кожну зміну → інші пристрої оновлюють дані; оптимістичне блокування (`@Version`) від конфліктів; список пристроїв і завершення сеансів | `RealtimeSyncIntegrationTest`, `SyncProvider.test`, `tokens.test`, e2e «телефон → ноутбук» |
| **REQ-4.3** Експорт та імпорт CSV · FIN-8 | Експорт (UTF-8 з BOM, кома або «;»); імпорт з попереднім переглядом: UTF-8/Windows-1251, автовизначення роздільника й колонок (у т.ч. банківські виписки), дублікати | `CsvImportIntegrationTest`, `CsvParsingTest`, `SettingsPage.test`, e2e імпорт виписки |
| **REQ-4.4** Захист PIN-кодом або біометрією на клієнті | PIN (PBKDF2-SHA256, 150 000 ітерацій) у сховищі пристрою, автоблокування після бездіяльності, 5 спроб; біометрія — WebAuthn (Windows Hello, Touch ID, відбиток) | `pin.test`, `biometric.test`, `LockProvider.test`, `LockScreen.test`, e2e PIN |

Ключі FIN-x відповідають задачам на Kanban-дошці Jira з рис. 2.1–2.2 звіту.

## Швидкий старт

Потрібен лише Docker (Java/Node локально не обов'язкові).

```bash
cp .env.example .env            # за потреби змініть порти/секрети
docker compose up -d --build
```

| Сервіс | Адреса |
|---|---|
| FinTrack (SPA + API) | http://localhost:8088 |
| Swagger UI | http://localhost:8088/swagger-ui.html |
| Mailpit — листи підтвердження email | http://localhost:8026 |
| Prometheus / Grafana (`--profile monitoring`) | http://localhost:9090 / http://localhost:3001 (admin / admin) |

1. Відкрийте http://localhost:8088 → «Зареєструватися».
2. Лист із посиланням для підтвердження з'явиться в Mailpit (http://localhost:8026) — перейдіть за ним, вхід виконається автоматично.
3. Для перевірки синхронізації відкрийте застосунок у двох браузерах (або на телефоні в тій самій мережі) під одним акаунтом.

Моніторинг: `docker compose --profile monitoring up -d` — дашборд «FinTrack — стан застосунку» та правила алертів
(`monitoring/prometheus/alerts.yml`) створюються автоматично.

### Вхід через Google

1. У Google Cloud Console створіть OAuth Client ID (тип *Web application*).
2. Authorized redirect URI: `http://localhost:8088/login/oauth2/code/google` (для іншого домену — `<FRONTEND_URL>/login/oauth2/code/google`).
3. Вкажіть `GOOGLE_CLIENT_ID` і `GOOGLE_CLIENT_SECRET` у `.env` та перезапустіть backend — на сторінці входу з'явиться кнопка Google.

## Розробка

```bash
# база даних і пошта в Docker
docker compose up -d db mailpit

# backend (Java 21): http://localhost:8080, management/metrics: http://localhost:8081
cd backend && mvn spring-boot:run

# frontend: http://localhost:5173 (проксі на backend налаштовано у vite.config.ts)
cd frontend && npm install && npm run dev
```

Без локальної Java backend можна зібрати й протестувати в Docker:

```bash
docker run --rm -v "$PWD/backend:/workspace" -w /workspace maven:3.9-eclipse-temurin-21 mvn -B verify
```

## Тестування

Тести є на трьох рівнях, і кожна вимога REQ-x.y перевіряється щонайменше одним із них (див. таблицю вище).

| Рівень | Команда | Що перевіряє |
|---|---|---|
| Backend | `cd backend && mvn verify` | 94 тести JUnit 5: модульні (періодичність, тренд, парсинг CSV, форматування, пошта, назви пристроїв, обробка помилок) та інтеграційні з H2 через REST API — кожен модуль, перенесення бюджету між місяцями й планувальник (на керованому годиннику), вміст PDF/Excel, вхід через Google, WebSocket-синхронізація |
| Frontend | `cd frontend && npm run test:coverage` | 192 тести Vitest + Testing Library: кожна сторінка й форма, API-клієнт з оновленням токенів, синхронізація, блокування PIN/біометрією, маршрутизація застосунку |
| E2E | `docker compose up -d --build --wait`<br>`cd e2e && npm ci && npx playwright test` | 10 наскрізних сценаріїв Playwright проти запущеного стеку: REST API, реєстрація з листом у Mailpit, бюджетне сповіщення, синхронізація «телефон → ноутбук» і завершення сеансу, PIN, завантаження звітів, імпорт виписки, мобільна версія |
| Статичний аналіз | `cd frontend && npm run lint` | ESLint (TypeScript, правила React Hooks) |

Покриття коду перевіряється автоматично: збірка падає, якщо воно опуститься нижче порогів.

| Частина | Рядки | Функції / методи | Розгалуження | Поріг (рядки / функції / розгалуження) | Звіт |
|---|---|---|---|---|---|
| Backend (JaCoCo) | 97% | 98,9% | 81,7% | 95% / 97% / 78% | `backend/target/site/jacoco/index.html` |
| Frontend (V8) | 96,3% | 95,7% | 89,8% | 94% / 93% / 86% | `frontend/coverage/index.html` |

Локально e2e використовують встановлений Google Chrome; у CI — Chromium від Playwright.

## CI/CD

`.github/workflows/ci-cd.yml`:

1. **backend** — `mvn verify` (тести + пороги покриття JaCoCo), звіти тестів і покриття та jar як артефакти;
2. **frontend** — `npm ci`, `lint`, `test:coverage` (з порогами), `build`, звіт покриття;
3. **e2e** — `docker compose up --wait` збирає й запускає весь стек, Playwright проганяє наскрізні сценарії, звіт — артефакт;
4. **docker** (лише `main`, після зелених тестів) — образи `backend` і `frontend` у GitHub Container Registry з тегами `sha` і `latest`;
5. **deploy** — якщо задано змінну `DEPLOY_HOST` і секрети `DEPLOY_USER`, `DEPLOY_SSH_KEY`, на сервері виконується
   `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && up -d` (каталог `/opt/fintrack`).

## Конфігурація backend

| Змінна | За замовчуванням | Опис |
|---|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | `jdbc:postgresql://localhost:5433/fintrack`, `fintrack`, `fintrack` | Підключення до PostgreSQL |
| `JWT_SECRET` | dev-значення | Ключ підпису JWT (HS256, ≥ 32 символи) |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | `15m`, `30d` | Термін дії токенів |
| `FRONTEND_URL` | `http://localhost:5173` | Адреса SPA для посилань у листах і OAuth-редиректу |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SMTP_AUTH`, `MAIL_STARTTLS`, `MAIL_FROM` | Mailpit | SMTP для листів підтвердження |
| `MAIL_ENABLED` | `true` | `false` — посилання підтвердження пишеться в журнал замість надсилання |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Вмикають вхід через Google |
| `APP_TIMEZONE` | `Europe/Kyiv` | Часовий пояс для «сьогодні», регулярних платежів і бюджетних періодів |
| `SCHEDULING_ENABLED` | `true` | Планувальник регулярних операцій і бюджетних періодів |

## Структура репозиторію

```
backend/                 Spring Boot (Maven), Flyway-міграції, тести
frontend/                React SPA (Vite), nginx.conf, тести
e2e/                     наскрізні тести Playwright
monitoring/              Prometheus (scrape + alerts), Grafana (datasource + dashboard)
docs/KANBAN.md           процес розробки: колонки, WIP-ліміти, політики, ролі
.github/                 CI/CD конвеєр, шаблон pull request
docker-compose.yml       локальне/демо-середовище; docker-compose.prod.yml — продакшн-оверрайд
```
