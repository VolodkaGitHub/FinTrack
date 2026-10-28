package com.fintrack.budgeting.budget;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

/** REQ-2.2: місячний бюджет категорії витрат (разом з її підкатегоріями). */
@Entity
@Table(name = "budgets")
@Getter
@Setter
@NoArgsConstructor
public class Budget {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Long userId;

    @Column(nullable = false)
    private Long categoryId;

    @Column(nullable = false)
    private BigDecimal amount;

    /** REQ-2.4: true — невикористаний залишок переноситься на наступний місяць, false — скидається. */
    private boolean rollover;

    /** REQ-2.3: поріг попередження у відсотках. */
    @Column(nullable = false)
    private int alertThreshold = 80;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;
}
